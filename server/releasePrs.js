// Release PR monitor for Milo and its consumer repos: the open stage -> main
// PR plus recent ones, with sign-off labels, CI check rollup and the PRs the
// release bundles (listed in the release PR body).
/* global process */
import { ghGet } from './github.js';

const TTL_MS = 2 * 60 * 1000;
const MAX_RELEASES = 8;
const MAX_INCLUDED = 40;
const CONCURRENCY = 5;

const FAILED = new Set(['failure', 'timed_out', 'action_required', 'startup_failure', 'error']);
const PASSED = new Set(['success', 'neutral', 'skipped']);

const DEFAULT_REPOS = 'adobecom/milo=Milo,adobecom/da-express-milo=Express,adobecom/da-cc=CC,'
  + 'adobecom/da-bacom=BACOM,adobecom/da-dc=DC';

// RELEASE_REPOS="owner/repo=Name,..."; release PRs are matched by branch
// (RELEASE_HEAD -> RELEASE_BASE) since titles differ between repos.
export function parseRepos(spec = DEFAULT_REPOS) {
  return String(spec).split(',').map((s) => s.trim()).filter(Boolean).map((entry) => {
    const [full, name] = entry.split('=');
    const [owner, repo] = full.trim().split('/');
    return { id: `${owner}/${repo}`, owner, repo, name: (name || repo || '').trim() };
  }).filter((r) => r.owner && r.repo);
}

export function releaseRepos() {
  return parseRepos(process.env.RELEASE_REPOS || DEFAULT_REPOS);
}

function branches() {
  return { head: process.env.RELEASE_HEAD || 'stage', base: process.env.RELEASE_BASE || 'main' };
}

// PR numbers in this repo referenced by the release body, in order, deduped.
export function parseIncludedPrs(body, owner, repo) {
  const re = new RegExp(`github\\.com/${owner}/${repo}/pull/(\\d+)`, 'gi');
  const seen = new Set();
  for (const m of String(body || '').matchAll(re)) seen.add(Number(m[1]));
  return [...seen];
}

// One row per check name (newest wins), bucketed into failed/pending/passed.
// `ignoreSuites`: check-suite ids not tied to the PR (e.g. scheduled workflows
// on the default branch that share the PR head sha) — GitHub's PR Checks tab hides them.
export function summarizeChecks(checkRuns = [], statuses = [], ignoreSuites = new Set()) {
  const byName = new Map();
  const add = (row) => {
    const prev = byName.get(row.name);
    if (!prev || (row.at || '') > (prev.at || '')) byName.set(row.name, row);
  };
  for (const c of checkRuns) {
    if (ignoreSuites.has(c.check_suite?.id)) continue;
    const state = c.status !== 'completed' ? 'pending' : (c.conclusion || 'pending');
    add({ name: c.name, state, url: c.html_url, at: c.completed_at || c.started_at });
  }
  for (const s of statuses) add({ name: s.context, state: s.state, url: s.target_url, at: s.updated_at });

  const rows = [...byName.values()].map((row) => ({ name: row.name, state: row.state, url: row.url }));
  const bucket = (state) => {
    if (FAILED.has(state)) return 'failed';
    if (PASSED.has(state)) return 'passed';
    if (state === 'cancelled') return 'cancelled';
    return 'pending';
  };
  const counts = { passed: 0, failed: 0, pending: 0, cancelled: 0 };
  rows.forEach((r) => { counts[bucket(r.state)] += 1; });
  let overall = 'passed';
  if (counts.failed) overall = 'failed';
  else if (counts.pending) overall = 'pending';
  else if (!rows.length) overall = 'none';
  return {
    overall,
    counts,
    total: rows.length,
    failed: rows.filter((r) => bucket(r.state) === 'failed'),
    pending: rows.filter((r) => bucket(r.state) === 'pending'),
  };
}

export function isSignoff(label) {
  return /\bSOT\b/i.test(label);
}

// Teams that signed off on other recent releases but not on this one.
export function signoffs(labels, expected) {
  const have = labels.filter(isSignoff);
  return { signed: have, missing: expected.filter((l) => !have.includes(l)) };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i;
      i += 1;
      out[idx] = await fn(items[idx]);
    }
  }));
  return out;
}

// Completed checks on a merged/closed release never change, so cache by sha.
const checkCache = new Map();
const prCache = new Map();

async function checksFor(owner, repo, sha, final) {
  if (checkCache.has(sha)) return checkCache.get(sha);
  const [runs, status, scheduled] = await Promise.all([
    ghGet(`/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`),
    ghGet(`/repos/${owner}/${repo}/commits/${sha}/status?per_page=100`),
    ghGet(`/repos/${owner}/${repo}/actions/runs?head_sha=${sha}&event=schedule&per_page=100`)
      .catch(() => ({ workflow_runs: [] })),
  ]);
  const ignore = new Set((scheduled.workflow_runs || []).map((r) => r.check_suite_id));
  const summary = summarizeChecks(runs.check_runs, status.statuses, ignore);
  if (final) checkCache.set(sha, summary);
  return summary;
}

async function includedPr(owner, repo, number) {
  const key = `${owner}/${repo}#${number}`;
  const hit = prCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.value;
  try {
    const p = await ghGet(`/repos/${owner}/${repo}/pulls/${number}`);
    const value = {
      number,
      title: p.title,
      author: p.user?.login,
      url: p.html_url,
      state: p.merged_at ? 'merged' : p.state,
      labels: (p.labels || []).map((l) => l.name),
    };
    prCache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return { number, url: `https://github.com/${owner}/${repo}/pull/${number}` };
  }
}

async function load({ owner, repo, name }) {
  const { head, base } = branches();
  const list = await ghGet(`/repos/${owner}/${repo}/pulls?state=all&head=${owner}:${head}&base=${base}`
    + `&sort=created&direction=desc&per_page=${MAX_RELEASES}`);
  const items = (list || []).slice(0, MAX_RELEASES);

  const releases = await mapLimit(items, CONCURRENCY, async (it) => {
    const pr = await ghGet(`/repos/${owner}/${repo}/pulls/${it.number}`);
    const open = pr.state === 'open';
    const checks = await checksFor(owner, repo, pr.head.sha, !open).catch((e) => ({ overall: 'unknown', error: e.message }));
    return {
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      state: pr.merged_at ? 'merged' : pr.state,
      draft: pr.draft,
      author: pr.user?.login,
      createdAt: pr.created_at,
      mergedAt: pr.merged_at,
      closedAt: pr.closed_at,
      head: pr.head.ref,
      base: pr.base.ref,
      sha: pr.head.sha,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
      commits: pr.commits,
      mergeableState: pr.mergeable_state,
      labels: (pr.labels || []).map((l) => l.name),
      checks,
      includedNumbers: parseIncludedPrs(pr.body, owner, repo).filter((n) => n !== pr.number),
    };
  });

  const expected = [...new Set(releases.flatMap((r) => r.labels.filter(isSignoff)))].sort();
  for (const r of releases) {
    Object.assign(r, signoffs(r.labels, expected));
    const nums = r.includedNumbers.slice(0, MAX_INCLUDED);
    // Titles/authors only for open releases; history just needs the count.
    r.included = r.state === 'open'
      ? await mapLimit(nums, CONCURRENCY, (n) => includedPr(owner, repo, n))
      : nums.map((n) => ({ number: n, url: `https://github.com/${owner}/${repo}/pull/${n}` }));
    r.includedCount = r.includedNumbers.length;
    delete r.includedNumbers;
  }

  return {
    owner, repo, name, head, base, expectedSignoffs: expected, releases, updatedAt: new Date().toISOString(),
  };
}

const cache = new Map(); // repo id -> { cached, inflight }

export async function getReleasePrs({ repo: id, force = false } = {}) {
  const repos = releaseRepos();
  const target = id ? repos.find((r) => r.id.toLowerCase() === String(id).toLowerCase()) : repos[0];
  if (!target) throw Object.assign(new Error(`Unknown release repo: ${id}`), { status: 404 });
  const slot = cache.get(target.id) || {};
  cache.set(target.id, slot);
  if (!force && slot.cached && Date.now() - slot.cached.at < TTL_MS) return slot.cached.value;
  if (!slot.inflight) {
    slot.inflight = load(target)
      .then((value) => {
        slot.cached = { at: Date.now(), value };
        return value;
      })
      .finally(() => { slot.inflight = null; });
  }
  if (slot.cached && !force) {
    slot.inflight.catch(() => {});
    return slot.cached.value;
  }
  return slot.inflight;
}
