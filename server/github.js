// Minimal GitHub Actions REST client for the nala-auto run console.
// Holds the token server-side only; the frontend never sees it.
/* global process */
const API = 'https://api.github.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cfg() {
  return {
    owner: process.env.GH_OWNER || 'JackySun9',
    repo: process.env.GH_REPO || 'milo',
    workflow: process.env.GH_WORKFLOW || 'screenshot-diff-nala-parallel.yml',
    iosWorkflow: process.env.GH_IOS_WORKFLOW || 'run-nala-ios.yml',
    bcWorkflow: process.env.GH_BC_WORKFLOW || 'brand-concierge-agent.yml',
    // Figma compare rides the screenshot workflow by default (same one-off
    // dataset seam, plus figma_url/selector inputs). Point it at a dedicated
    // workflow file with GH_FIGMA_WORKFLOW if milo ever splits it out.
    figmaWorkflow: process.env.GH_FIGMA_WORKFLOW || process.env.GH_WORKFLOW || 'screenshot-diff-nala-parallel.yml',
    ref: process.env.GH_REF || 'main',
    token: process.env.GITHUB_TOKEN || '',
  };
}

export function isLive() {
  return !!cfg().token;
}

export function config() {
  const c = cfg();
  return {
    owner: c.owner,
    repo: c.repo,
    workflow: c.workflow,
    iosWorkflow: c.iosWorkflow,
    bcWorkflow: c.bcWorkflow,
    figmaWorkflow: c.figmaWorkflow,
    ref: c.ref,
  };
}

// Which workflow file backs a given run kind.
export function workflowFor(kind) {
  const c = cfg();
  if (kind === 'ios') return c.iosWorkflow;
  if (kind === 'figma') return c.figmaWorkflow;
  if (kind === 'bc') return c.bcWorkflow;
  return c.workflow;
}

async function gh(path, opts = {}) {
  const c = cfg();
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${c.token}`,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...opts.headers,
    },
  });
}

// Read-only GET against any repo (e.g. adobecom/milo release PRs). Works
// unauthenticated for public repos, at GitHub's lower anonymous rate limit.
export async function ghGet(path) {
  const { token } = cfg();
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`GET ${path} failed (${res.status}): ${body.message || res.statusText}`);
  }
  return res.json();
}

// Trigger workflow_dispatch. GitHub returns 204 with no run id, so callers
// use findRun() to locate the run created just after this returns.
export async function dispatch(inputs, workflow) {
  const c = cfg();
  const wf = workflow || c.workflow;
  const t0 = Date.now();
  const res = await gh(
    `/repos/${c.owner}/${c.repo}/actions/workflows/${encodeURIComponent(wf)}/dispatches`,
    { method: 'POST', body: JSON.stringify({ ref: c.ref, inputs }) }
  );
  if (res.status !== 204) {
    throw new Error(`dispatch failed (${res.status}): ${await res.text()}`);
  }
  return t0;
}

// Several console runs can be in flight on the same workflow, so "newest run
// since dispatch" is not enough. The workflows put our run id in run-name
// ("… [<runId>]"), which is matched exactly; otherwise fall back to the oldest
// fresh run that no other console run has claimed and that isn't tagged with
// a different id.
export function pickRun(workflowRuns, sinceMs, runId, isClaimed = () => false) {
  const tag = (r) => (r.display_title || r.name || '').match(/\[([\w-]+)\]\s*$/)?.[1];
  const fresh = (workflowRuns || []).filter(
    (r) => new Date(r.created_at).getTime() >= sinceMs - 5000 && !isClaimed(r.id)
  );
  if (runId) {
    const exact = fresh.find((r) => tag(r) === runId);
    if (exact) return exact;
  }
  const untagged = fresh
    .filter((r) => !tag(r))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return untagged[0] || null;
}

export async function findRun(sinceMs, workflow, runId, isClaimed) {
  const c = cfg();
  const wf = workflow || c.workflow;
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    const res = await gh(
      `/repos/${c.owner}/${c.repo}/actions/workflows/${encodeURIComponent(wf)}/runs?branch=${c.ref}&event=workflow_dispatch&per_page=20`
    );
    if (!res.ok) continue;
    const data = await res.json();
    const run = pickRun(data.workflow_runs, sinceMs, runId, isClaimed);
    if (run) return run;
  }
  return null;
}

export async function getRun(runId) {
  const c = cfg();
  const res = await gh(`/repos/${c.owner}/${c.repo}/actions/runs/${runId}`);
  return res.ok ? res.json() : null;
}

// Self-hosted runners registered on the repo. Needs the token to have
// "Administration: Read" (fine-grained) or admin on the repo (classic), which
// the dispatch-only token usually lacks — so report why instead of throwing
// and let callers fall back to what job history can tell them.
export async function listRunners() {
  const c = cfg();
  const res = await gh(`/repos/${c.owner}/${c.repo}/actions/runners?per_page=100`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { runners: null, error: `${res.status}: ${body.message || res.statusText}` };
  }
  const data = await res.json();
  return { runners: data.runners || [], error: null };
}

// Repo-wide workflow runs; `query` is a raw query string, e.g. "status=queued".
export async function listRepoRuns(query) {
  const c = cfg();
  const res = await gh(`/repos/${c.owner}/${c.repo}/actions/runs?${query}`);
  if (!res.ok) throw new Error(`list runs failed (${res.status})`);
  const data = await res.json();
  return data.workflow_runs || [];
}

// Full job objects (runner_name, labels, timestamps) for one run.
export async function listRunJobs(runId) {
  const c = cfg();
  const res = await gh(`/repos/${c.owner}/${c.repo}/actions/runs/${runId}/jobs?per_page=100`);
  if (!res.ok) throw new Error(`list jobs failed (${res.status})`);
  const data = await res.json();
  return data.jobs || [];
}

export async function getJobs(runId) {
  const c = cfg();
  const res = await gh(`/repos/${c.owner}/${c.repo}/actions/runs/${runId}/jobs`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobs || []).map((j) => ({
    name: j.name,
    status: j.status,
    conclusion: j.conclusion,
    htmlUrl: j.html_url,
  }));
}
