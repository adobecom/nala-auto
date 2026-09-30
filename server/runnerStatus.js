// Self-hosted runner fleet status for the /runners page.
//
// Two sources, merged:
//   1. The runners API (online/offline/busy for every registered Mac mini).
//      Needs "Administration: Read" on the token; when it is missing we say so.
//   2. Job history. Every job records the runner that picked it up, so this
//      alone shows which runners are busy, what they last ran, and which jobs
//      are still waiting for a runner. Runners are discovered from the last
//      DISCOVERY_DAYS; per-runner counts cover the last WINDOW_HOURS.
// Completed runs never change, so their jobs are cached for as long as they
// stay in the window; a refresh only re-fetches runs that are still active.
/* global process */
import * as gh from './github.js';

export const WINDOW_HOURS = 24;
export const DISCOVERY_DAYS = 14;
const MAX_RUN_PAGES = 5;
const TTL_MS = 20_000;
const FETCH_CONCURRENCY = 6;
const RECENT_LIMIT = 30;

const jobCache = new Map(); // runId -> normalized jobs (completed runs only)
let cached = null; // { at, value }
let inflight = null;

const QUEUED = new Set(['queued', 'waiting', 'pending', 'requested']);

// Some Mac minis registered under their DNS hostname (sj1010122072235)
// but carry their MacNodeXX name as a runner label. Prefer that label; the
// runners API is needed to see it, so RUNNER_ALIASES ("host=Name,...") can
// supply the mapping when only job history is available.
function parseAliases(value = '') {
  return Object.fromEntries(value.split(',')
    .map((pair) => pair.split('=').map((part) => part.trim()))
    .filter(([host, name]) => host && name));
}

// Labels as shown in the repo's runner settings (runners API needs admin).
const DEFAULT_ALIASES = {
  sj1010122072226: 'MacNode03',
  sj1010122072231: 'MacNode05',
  sj1010122072234: 'MacNode07',
  sj1010122072235: 'MacNode08',
};

const NODE_LABEL = /^macnode\d+$/i;

export function runnerDisplayName(name, labels = [], aliases = { ...DEFAULT_ALIASES, ...parseAliases(process.env.RUNNER_ALIASES) }) {
  if (!name) return name;
  if (aliases[name]) return aliases[name];
  const label = labels.find((value) => NODE_LABEL.test(value));
  return label && !NODE_LABEL.test(name) ? label.replace(/^macnode/i, 'MacNode') : name;
}

export function normalizeJob(job) {
  return {
    id: job.id,
    runId: job.run_id,
    name: job.name,
    workflow: job.workflow_name || '',
    status: job.status,
    conclusion: job.conclusion || null,
    runner: runnerDisplayName(job.runner_name) || null,
    runnerHost: job.runner_name || null,
    labels: job.labels || [],
    htmlUrl: job.html_url,
    createdAt: job.created_at || null,
    startedAt: job.started_at || null,
    completedAt: job.completed_at || null,
  };
}

const ts = (value) => (value ? new Date(value).getTime() : 0);
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });

// Pure: turn runner records + job history into what the page renders.
export function summarize({ runners, runnersError, jobs, now = Date.now() }) {
  const selfHosted = jobs.filter((job) => job.labels.includes('self-hosted'));
  const windowStart = now - WINDOW_HOURS * 3600_000;

  const activity = new Map();
  for (const job of selfHosted) {
    if (!job.runner) continue;
    const entry = activity.get(job.runner) || { current: null, last: null, lastSeen: null, jobs: 0, failures: 0 };
    const seenAt = job.completedAt || job.startedAt;
    if (seenAt && ts(seenAt) > ts(entry.lastSeen)) entry.lastSeen = seenAt;
    if (job.status === 'in_progress') {
      if (!entry.current || ts(job.startedAt) > ts(entry.current.startedAt)) entry.current = job;
    } else if (job.status === 'completed') {
      if (!entry.last || ts(job.completedAt) > ts(entry.last.completedAt)) entry.last = job;
      if (ts(job.completedAt) >= windowStart) {
        entry.jobs += 1;
        if (job.conclusion === 'failure' || job.conclusion === 'timed_out') entry.failures += 1;
      }
    }
    activity.set(job.runner, entry);
  }

  const empty = { current: null, last: null, lastSeen: null, jobs: 0, failures: 0 };
  let list;
  if (runners) {
    list = runners.map((runner) => {
      const labelNames = (runner.labels || []).map((label) => label.name);
      const name = runnerDisplayName(runner.name, labelNames);
      const seen = activity.get(name) || empty;
      const status = runner.status !== 'online' ? 'offline' : runner.busy || seen.current ? 'busy' : 'idle';
      return {
        name,
        host: runner.name,
        os: runner.os,
        status,
        labels: (runner.labels || []).map((label) => label.name).filter((label) => label !== 'self-hosted'),
        ...seen,
      };
    });
  } else {
    // Without the runners API we only know runners that ran something, and
    // cannot tell "idle" from "offline": "seen" ran a job in the last
    // WINDOW_HOURS, "quiet" only earlier.
    list = [...activity.entries()].map(([name, seen]) => {
      const labels = (seen.current || seen.last)?.labels || [];
      let status = 'quiet';
      if (seen.current) status = 'busy';
      else if (ts(seen.lastSeen) >= windowStart) status = 'seen';
      return {
        name,
        host: (seen.current || seen.last)?.runnerHost || name,
        os: null,
        status,
        labels: labels.filter((label) => label !== 'self-hosted'),
        ...seen,
      };
    });
  }
  list.sort(byName);

  const queued = selfHosted
    .filter((job) => QUEUED.has(job.status))
    .sort((a, b) => ts(a.createdAt) - ts(b.createdAt));

  const recent = selfHosted
    .filter((job) => job.runner && job.startedAt)
    .sort((a, b) => ts(b.startedAt) - ts(a.startedAt))
    .slice(0, RECENT_LIMIT);

  const count = (status) => list.filter((runner) => runner.status === status).length;
  return {
    source: runners ? 'runners-api' : 'job-history',
    runnersError: runners ? null : runnersError,
    windowHours: WINDOW_HOURS,
    discoveryDays: DISCOVERY_DAYS,
    totals: {
      runners: list.length,
      busy: count('busy'),
      idle: count('idle'),
      offline: count('offline'),
      seen: count('seen'),
      quiet: count('quiet'),
      queued: queued.length,
    },
    runners: list,
    queued,
    recent,
  };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function collectJobs(now) {
  const since = new Date(now - DISCOVERY_DAYS * 86400_000).toISOString().replace(/\.\d+Z$/, 'Z');
  const listRecent = async () => {
    const all = [];
    for (let page = 1; page <= MAX_RUN_PAGES; page += 1) {
      const runs = await gh.listRepoRuns(`per_page=100&page=${page}&created=${encodeURIComponent(`>=${since}`)}`);
      all.push(...runs);
      if (runs.length < 100) break;
    }
    return all;
  };
  const [recent, active, queued] = await Promise.all([
    listRecent(),
    gh.listRepoRuns('per_page=50&status=in_progress'),
    gh.listRepoRuns('per_page=50&status=queued'),
  ]);
  const runs = new Map();
  for (const run of [...recent, ...active, ...queued]) {
    if (run.conclusion !== 'skipped') runs.set(run.id, run);
  }

  const perRun = await mapLimit([...runs.values()], FETCH_CONCURRENCY, async (run) => {
    if (jobCache.has(run.id)) return jobCache.get(run.id);
    try {
      const jobs = (await gh.listRunJobs(run.id)).map(normalizeJob);
      if (run.status === 'completed') jobCache.set(run.id, jobs);
      return jobs;
    } catch {
      return [];
    }
  });

  for (const id of jobCache.keys()) if (!runs.has(id)) jobCache.delete(id);
  return perRun.flat();
}

async function load() {
  const now = Date.now();
  const [{ runners, error }, jobs] = await Promise.all([gh.listRunners(), collectJobs(now)]);
  return { ...summarize({ runners, runnersError: error, jobs, now }), updatedAt: new Date(now).toISOString() };
}

export async function getRunnerStatus() {
  if (!gh.isLive()) {
    return {
      mode: 'mock',
      message: 'No GITHUB_TOKEN is set, so runner status is unavailable.',
      totals: { runners: 0, busy: 0, idle: 0, offline: 0, seen: 0, quiet: 0, queued: 0 },
      runners: [],
      queued: [],
      recent: [],
    };
  }
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  if (!inflight) {
    inflight = load()
      .then((value) => {
        const { owner, repo } = gh.config();
        cached = { at: Date.now(), value: { mode: 'live', owner, repo, ...value } };
        return cached.value;
      })
      .finally(() => { inflight = null; });
  }
  // A refresh takes several seconds of GitHub calls; serve the previous
  // snapshot meanwhile (its updatedAt shows its age) and only wait on the first load.
  if (cached) {
    inflight.catch(() => {});
    return cached.value;
  }
  return inflight;
}
