// Minimal GitHub Actions REST client for the nala-auto run console.
// Holds the token server-side only; the frontend never sees it.
const API = 'https://api.github.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cfg() {
  return {
    owner: process.env.GH_OWNER || 'JackySun9',
    repo: process.env.GH_REPO || 'milo',
    workflow: process.env.GH_WORKFLOW || 'screenshot-diff-nala-parallel.yml',
    iosWorkflow: process.env.GH_IOS_WORKFLOW || 'run-nala-ios.yml',
    ref: process.env.GH_REF || 'main',
    token: process.env.GITHUB_TOKEN || '',
  };
}

export function isLive() {
  return !!cfg().token;
}

export function config() {
  const c = cfg();
  return { owner: c.owner, repo: c.repo, workflow: c.workflow, iosWorkflow: c.iosWorkflow, ref: c.ref };
}

// Which workflow file backs a given run kind.
export function workflowFor(kind) {
  const c = cfg();
  return kind === 'ios' ? c.iosWorkflow : c.workflow;
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

export async function findRun(sinceMs, workflow) {
  const c = cfg();
  const wf = workflow || c.workflow;
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    const res = await gh(
      `/repos/${c.owner}/${c.repo}/actions/workflows/${encodeURIComponent(wf)}/runs?branch=${c.ref}&event=workflow_dispatch&per_page=10`
    );
    if (!res.ok) continue;
    const data = await res.json();
    const run = (data.workflow_runs || []).find(
      (r) => new Date(r.created_at).getTime() >= sinceMs - 5000
    );
    if (run) return run;
  }
  return null;
}

export async function getRun(runId) {
  const c = cfg();
  const res = await gh(`/repos/${c.owner}/${c.repo}/actions/runs/${runId}`);
  return res.ok ? res.json() : null;
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
