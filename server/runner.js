// Run store + driver. Supports two run kinds:
//   - 'screenshot' → the existing screenshot-diff-nala-parallel.yml (chrome/ipad/iphone shards)
//   - 'ios'        → run-nala-ios.yml (one job per selected iOS Simulator version)
// LIVE mode dispatches the real workflow and polls its jobs; MOCK mode
// simulates the same lifecycle so the UI is fully demoable with no token.
import { randomUUID } from 'node:crypto';
import * as gh from './github.js';

const runs = new Map();
const NALA_BASE = process.env.NALA_AUTO_BASE || 'http://nala-auto.corp.adobe.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mkJob = (name) => ({ name, status: 'queued', conclusion: null, htmlUrl: null });

// Minimum iOS a device model can run (keep in sync with iosDeviceMinVersion in
// index.js and min_ios() in run-nala-ios.yml). A model has no simulator build for
// an iOS released before it, so those pairs are dropped — never tracked or run.
const IOS_MIN = {
  'iPhone 16 Pro Max': '18.0', 'iPhone 16 Pro': '18.0', 'iPhone 16': '18.0',
  'iPad Pro 11-inch (M4)': '17.4', 'iPad Air 11-inch (M2)': '17.5',
};
const cmpVer = (a, b) => a.split('.').reduce((acc, n, i) => acc || Number(n) - (Number(b.split('.')[i]) || 0), 0);
const pairRunnable = (d, v) => cmpVer(v, IOS_MIN[d] || '0') >= 0;

export function createRun(body = {}) {
  const kind = body.kind === 'ios' ? 'ios' : 'screenshot';
  const site = (body.site || 'bacom').trim();
  const milolibs = (body.milolibs ?? '?milolibs=stage').trim();
  const device = (body.device || 'iPhone 15').trim();
  const devices =
    Array.isArray(body.devices) && body.devices.length ? body.devices : [device];
  const iosVersions =
    Array.isArray(body.iosVersions) && body.iosVersions.length ? body.iosVersions : ['18.3'];
  const maxUrls = Number(body.maxUrls || 0);
  const id = randomUUID().slice(0, 8);
  const live = gh.isLive();

  const mockJobs =
    kind === 'ios'
      ? devices.flatMap((d) => iosVersions.filter((v) => pairRunnable(d, v)).map((v) => mkJob(`${d} · iOS ${v}`)))
      : ['chrome', 'ipad', 'iphone'].map(mkJob);

  const run = {
    id,
    kind,
    site,
    milolibs,
    device,
    devices,
    iosVersions,
    maxUrls,
    mode: live ? 'live' : 'mock',
    startedAt: Date.now(),
    ghRunId: null,
    htmlUrl: null,
    status: 'dispatching',
    conclusion: null,
    note: null,
    jobs: live ? [] : mockJobs,
    resultsUrl: `${NALA_BASE}/imagediff/${site}`,
    clients: new Set(),
    done: false,
    snapshot() {
      return {
        kind: 'update',
        runId: id,
        runKind: this.kind,
        site,
        milolibs,
        device,
        devices,
        iosVersions,
        mode: this.mode,
        status: this.status,
        conclusion: this.conclusion,
        note: this.note,
        ghRunId: this.ghRunId,
        htmlUrl: this.htmlUrl,
        jobs: this.jobs,
        resultsUrl: this.resultsUrl,
        done: this.done,
        startedAt: this.startedAt,
      };
    },
  };

  runs.set(id, run);
  (live ? driveLive(run) : driveMock(run)).catch((e) => {
    run.status = 'error';
    run.note = String(e);
    finish(run, 'failure');
  });
  return run;
}

export function getRun(id) {
  return runs.get(id);
}

// Recent runs (most recent first) so the UI can rediscover in-flight runs
// after a page refresh. In-memory only — a backend restart clears this.
export function listRuns(limit = 20) {
  return [...runs.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
    .map((r) => r.snapshot());
}

export function attachClient(id, ws) {
  const run = runs.get(id);
  if (!run) {
    try {
      ws.send(JSON.stringify({ kind: 'update', status: 'error', note: 'unknown runId', jobs: [] }));
      ws.close();
    } catch { /* noop */ }
    return;
  }
  run.clients.add(ws);
  try {
    ws.send(JSON.stringify(run.snapshot()));
  } catch { /* noop */ }
  ws.on('close', () => run.clients.delete(ws));
}

function push(run) {
  const msg = JSON.stringify(run.snapshot());
  for (const ws of run.clients) {
    try {
      ws.send(msg);
    } catch { /* noop */ }
  }
}

function finish(run, conclusion) {
  run.done = true;
  if (conclusion) run.conclusion = conclusion;
  if (run.status !== 'error') run.status = 'completed';
  push(run);
}

function inputsFor(run) {
  if (run.kind === 'ios') {
    return {
      site: run.site,
      milo_libs: run.milolibs,
      ios_versions: run.iosVersions.join(','),
      devices: run.devices.join(','),
      max_urls: String(run.maxUrls || 0),
    };
  }
  return { site: run.site, milo_libs: run.milolibs };
}

async function driveLive(run) {
  push(run);
  const wf = gh.workflowFor(run.kind);
  const t0 = await gh.dispatch(inputsFor(run), wf);
  run.status = 'locating run';
  push(run);

  const found = await gh.findRun(t0, wf);
  if (!found) {
    run.status = 'error';
    run.note = 'Dispatched, but could not locate the run via API. Check GitHub Actions directly.';
    finish(run);
    return;
  }
  run.ghRunId = found.id;
  run.htmlUrl = found.html_url;
  run.status = found.status || 'queued';
  push(run);

  for (;;) {
    const [r, jobs] = await Promise.all([gh.getRun(run.ghRunId), gh.getJobs(run.ghRunId)]);
    if (jobs && jobs.length) run.jobs = jobs;
    if (r) {
      run.status = r.status;
      run.conclusion = r.conclusion;
      run.htmlUrl = r.html_url;
    }
    push(run);
    if (r && r.status === 'completed') {
      finish(run, r.conclusion);
      return;
    }
    await sleep(4000);
  }
}

async function driveMock(run) {
  run.status = 'queued';
  push(run);
  await sleep(700);

  run.status = 'in_progress';
  run.htmlUrl = 'https://github.com/JackySun9/milo/actions';
  push(run);
  await sleep(500);

  // Stagger job durations. For screenshot runs iphone is longest (bundles the
  // merge step); for iOS runs each version takes a bit more than the last.
  const durationFor = (job, i) =>
    run.kind === 'ios'
      ? 3500 + i * 1200
      : { chrome: 3000, ipad: 4200, iphone: 6500 }[job.name] || 3000;

  await Promise.all(
    run.jobs.map(async (j, i) => {
      j.status = 'in_progress';
      push(run);
      await sleep(durationFor(j, i));
      const fail = Math.random() < 0.1;
      j.status = 'completed';
      j.conclusion = fail ? 'failure' : 'success';
      push(run);
    })
  );

  const anyFail = run.jobs.some((j) => j.conclusion === 'failure');
  finish(run, anyFail ? 'failure' : 'success');
}
