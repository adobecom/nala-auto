// Run store + driver. Supports five run kinds:
//   - 'screenshot' → the existing screenshot-diff-nala-parallel.yml (chrome/ipad/iphone shards)
//   - 'quick'      → same workflow on an ad-hoc URL list, published as its own
//                    one-off dataset (quick-<runId>) so it never touches a real one
//   - 'figma'      → one web URL vs one Figma node, scoped to one CSS selector and
//                    one viewport, published as its own dataset (figma-<runId>)
//   - 'ios'        → run-nala-ios.yml (one job per selected iOS Simulator version)
//   - 'bc'         → brand-concierge-agent.yml (standard conversational workflow)
// LIVE mode dispatches the real workflow and polls its jobs; MOCK mode
// simulates the same lifecycle so the UI is fully demoable with no token.
/* global process */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as gh from './github.js';
import { screenshotSiteInputs } from './workflowSites.js';
import { parseFigmaRun } from './figmaCompare.js';
import { resultsUrl } from './resultPaths.js';

const runs = new Map();
const NALA_BASE = process.env.NALA_AUTO_BASE || 'http://nala-auto.corp.adobe.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mkJob = (name) => ({ name, status: 'queued', conclusion: null, htmlUrl: null });

// Runs live in memory, but the backend restarts on every redeploy — which used
// to drop all tracking while the GitHub workflow kept running. Persist the plain
// run fields to disk so a restart reloads recent runs and resumes polling the
// in-flight ones.
const STATE_FILE =
  process.env.RUNS_STATE_FILE ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), '.runs.json');
const PLAIN_FIELDS = [
  'id', 'kind', 'site', 'milolibs', 'device', 'devices', 'iosVersions', 'maxUrls',
  'mode', 'startedAt', 'finishedAt', 'ghRunId', 'htmlUrl', 'status', 'conclusion', 'note', 'jobs',
  'resultsUrl', 'latestResultsUrl', 'done', 'urls', 'viewports', 'figmaUrl', 'figmaFileKey', 'figmaNodeId', 'selector',
];

export const VIEWPORTS = ['chrome', 'ipad', 'iphone'];
export const QUICK_MAX_URLS = 30;

// Validate a Quick Run URL list the same way the runner's parseUrlList() does
// (one "url" or "urlA | urlB" per line, http(s) only) so a bad paste is
// rejected here, instantly, instead of minutes later on a runner.
export function parseQuickUrls(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const bad = lines.filter((l) => !l.split('|').map((s) => s.trim()).filter(Boolean)
    .every((u) => /^https?:\/\/\S+$/i.test(u)) || l.split('|').length > 2);
  if (!lines.length) throw new Error('Enter at least one URL.');
  if (bad.length) throw new Error(`Not a valid URL line: ${bad.slice(0, 3).join(' ; ')}`);
  if (lines.length > QUICK_MAX_URLS) {
    throw new Error(`Quick run is capped at ${QUICK_MAX_URLS} URLs (got ${lines.length}) — add a dataset for bigger lists.`);
  }
  return lines;
}

export function parseBcUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('Enter a valid Brand Concierge page URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Brand Concierge URL must use http or https.');
  }
  return url.href;
}

function persist() {
  try {
    const recent = [...runs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 30);
    const data = recent.map((r) => Object.fromEntries(PLAIN_FIELDS.map((k) => [k, r[k]])));
    fs.writeFileSync(STATE_FILE, JSON.stringify(data));
  } catch { /* best effort — persistence must never break a run */ }
}

// Minimum iOS a device model can run (keep in sync with iosDeviceMinVersion in
// index.js and min_ios() in run-nala-ios.yml). A model has no simulator build for
// an iOS released before it, so those pairs are dropped — never tracked or run.
const IOS_MIN = {
  'iPhone 16 Pro Max': '18.0', 'iPhone 16 Pro': '18.0', 'iPhone 16': '18.0',
  'iPad Pro 11-inch (M4)': '17.4', 'iPad Air 11-inch (M2)': '17.5',
};
const cmpVer = (a, b) => a.split('.').reduce((acc, n, i) => acc || Number(n) - (Number(b.split('.')[i]) || 0), 0);
const pairRunnable = (d, v) => cmpVer(v, IOS_MIN[d] || '0') >= 0;

// Target parallel iOS jobs (~= the ios-sim runner count). Each device x version
// combo is split into floor(RUNNERS / combos) URL shards so one device fans out
// across the whole fleet. Override with IOS_RUNNERS if the pool grows/shrinks.
export const IOS_RUNNERS = Math.max(1, Number(process.env.IOS_RUNNERS || 4));
export const shardsFor = (combos) => Math.max(1, Math.floor(IOS_RUNNERS / Math.max(1, combos)));

// Build a run object from plain fields (used both for new runs and for runs
// reloaded from disk after a restart). snapshot() reads this.* only, so a
// reconstructed object behaves identically.
function makeRun(f) {
  return {
    ...f,
    clients: new Set(),
    snapshot() {
      return {
        kind: 'update',
        runId: this.id,
        runKind: this.kind,
        site: this.site,
        milolibs: this.milolibs,
        urls: this.urls,
        viewports: this.viewports,
        figmaUrl: this.figmaUrl,
        figmaFileKey: this.figmaFileKey,
        figmaNodeId: this.figmaNodeId,
        selector: this.selector,
        device: this.device,
        devices: this.devices,
        iosVersions: this.iosVersions,
        mode: this.mode,
        status: this.status,
        conclusion: this.conclusion,
        note: this.note,
        ghRunId: this.ghRunId,
        htmlUrl: this.htmlUrl,
        jobs: this.jobs,
        resultsUrl: this.resultsUrl,
        latestResultsUrl: this.latestResultsUrl,
        done: this.done,
        startedAt: this.startedAt,
        finishedAt: this.finishedAt,
      };
    },
  };
}

export function createRun(body = {}) {
  const kind = ['ios', 'quick', 'figma', 'bc'].includes(body.kind) ? body.kind : 'screenshot';
  // Throws on a bad list/URL/selector; index.js turns that into a 400.
  const figma = kind === 'figma' ? parseFigmaRun(body, VIEWPORTS) : null;
  const urls = kind === 'quick'
    ? parseQuickUrls(body.urls)
    : figma
      ? [figma.webUrl]
      : kind === 'bc'
        ? [parseBcUrl(body.url)]
        : undefined;
  const picked = Array.isArray(body.viewports) ? VIEWPORTS.filter((v) => body.viewports.includes(v)) : [];
  if (kind === 'quick' && !picked.length) throw new Error('Pick at least one viewport.');
  const viewports = kind === 'quick' ? picked : figma ? [figma.viewport] : undefined;
  const milolibs = (body.milolibs ?? '?milolibs=stage').trim();
  const device = (body.device || 'iPhone 15').trim();
  const devices =
    Array.isArray(body.devices) && body.devices.length ? body.devices : [device];
  const iosVersions =
    Array.isArray(body.iosVersions) && body.iosVersions.length ? body.iosVersions : ['18.3'];
  const maxUrls = Number(body.maxUrls || 0);
  const id = randomUUID().slice(0, 8);
  // One-off kinds publish to their own dataset so they never overwrite a real
  // site's results and each run keeps a stable /imagediff/<site> link.
  const site = kind === 'quick'
    ? `quick-${id}`
    : kind === 'figma'
      ? `figma-${id}`
      : kind === 'bc'
        ? new URL(urls[0]).host
        : (body.site || 'bacom').trim();
  const live = gh.isLive();

  // Different datasets may run side by side; the same dataset twice would race
  // on its "latest" results, so that one is refused. Quick/Figma get a fresh
  // one-off site per run and never collide.
  const dup = [...runs.values()].find(
    (r) => !r.done && r.kind === kind && r.site === site && Date.now() - r.startedAt < 6 * 3600e3
  );
  if (dup) throw new Error(`${site} is already running (#${dup.id}). Wait for it to finish or open it from Recent runs.`);
  const runnablePairs = devices.flatMap((d) => iosVersions.filter((v) => pairRunnable(d, v)).map((v) => ({ d, v })));
  const shards = shardsFor(runnablePairs.length);
  const mockJobs =
    kind === 'ios'
      ? runnablePairs.flatMap(({ d, v }) =>
          Array.from({ length: shards }, (_, s) => mkJob(`${d} · iOS ${v} · shard ${s + 1}/${shards}`)))
      : kind === 'bc'
        ? [mkJob('brand-concierge-agent')]
        : (viewports || VIEWPORTS).map(mkJob);

  const run = makeRun({
    id,
    kind,
    site,
    milolibs,
    device,
    devices,
    iosVersions,
    maxUrls,
    urls,
    viewports,
    figmaUrl: figma?.figma.url,
    figmaFileKey: figma?.figma.fileKey,
    figmaNodeId: figma?.figma.nodeId,
    selector: figma?.selector,
    mode: live ? 'live' : 'mock',
    startedAt: Date.now(),
    ghRunId: null,
    htmlUrl: null,
    status: 'dispatching',
    conclusion: null,
    note: null,
    jobs: live ? [] : mockJobs,
    // Pin the link to this run's immutable output so a dataset's older results
    // stay reachable after the next run overwrites "latest".
    resultsUrl: kind === 'bc' ? null : resultsUrl(NALA_BASE, site, id),
    latestResultsUrl: kind === 'bc' ? null : resultsUrl(NALA_BASE, site),
    done: false,
  });

  runs.set(id, run);
  persist();
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
  persist();
  const msg = JSON.stringify(run.snapshot());
  for (const ws of run.clients) {
    try {
      ws.send(msg);
    } catch { /* noop */ }
  }
}

const finishListeners = new Set();

// index.js hooks this to score finished screenshot runs against the baseline
// (visualHistory.js) without runner.js importing the image pipeline.
export function onRunFinished(fn) {
  finishListeners.add(fn);
  return () => finishListeners.delete(fn);
}

function finish(run, conclusion) {
  run.done = true;
  run.finishedAt = Date.now();
  if (conclusion) run.conclusion = conclusion;
  if (run.status !== 'error') run.status = 'completed';
  push(run);
  for (const fn of finishListeners) {
    try {
      fn(run.snapshot());
    } catch { /* listeners must never break a run */ }
  }
}

export function inputsFor(run) {
  // Every dispatch carries run_id: the workflow publishes its output under
  // .../runs/<run_id>/ so a dataset keeps every run instead of only the latest,
  // and the console can correlate a dispatch with the GitHub run it created.
  // Omitted entirely when absent so a payload never carries an undefined input.
  const runId = run.id ? { run_id: run.id } : {};
  if (run.kind === 'ios') {
    return {
      ...runId,
      site: run.site,
      milo_libs: run.milolibs,
      ios_versions: run.iosVersions.join(','),
      devices: run.devices.join(','),
      max_urls: String(run.maxUrls || 0),
      max_parallel: String(IOS_RUNNERS),
    };
  }
  if (run.kind === 'bc') {
    return {
      ...runId,
      url: run.urls[0],
    };
  }
  if (run.kind === 'quick') {
    return {
      ...runId,
      site: 'custom',
      custom_site: run.site,
      milo_libs: run.milolibs,
      urls: run.urls.join('\n'),
      viewports: run.viewports.join(','),
    };
  }
  // Figma compare reuses the screenshot workflow's one-off dataset seam
  // (site=custom + custom_site) and adds the two Figma-specific inputs. The
  // runner screenshots only `selector` on the page and diffs it against the
  // node in `figma_url`.
  if (run.kind === 'figma') {
    return {
      ...runId,
      site: 'custom',
      custom_site: run.site,
      milo_libs: run.milolibs,
      urls: run.urls.join('\n'),
      viewports: run.viewports.join(','),
      figma_url: run.figmaUrl,
      selector: run.selector,
    };
  }
  return { ...runId, ...screenshotSiteInputs(run.site), milo_libs: run.milolibs };
}

async function driveLive(run) {
  push(run);
  const wf = gh.workflowFor(run.kind);
  const t0 = await gh.dispatch(inputsFor(run), wf);
  run.status = 'locating run';
  push(run);

  const claimed = (ghId) => [...runs.values()].some((r) => r !== run && r.ghRunId === ghId);
  const found = await gh.findRun(t0, wf, run.id, claimed);
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

  await pollRun(run);
}

// Poll a run we already have a ghRunId for until it completes. Shared by a fresh
// dispatch (driveLive) and by runs resumed from disk after a restart.
async function pollRun(run) {
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

// On startup, reload persisted runs and resume polling the ones still in flight
// (so a redeploy doesn't lose a running job). Runs that were mid-dispatch when we
// restarted (no ghRunId yet) can't be reattached — mark them so the UI is honest.
function loadRuns() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return;
  }
  if (!Array.isArray(data)) return;
  for (const f of data) {
    if (!f || !f.id) continue;
    const run = makeRun(f);
    runs.set(run.id, run);
    if (run.done || run.mode !== 'live') continue;
    if (run.ghRunId && gh.isLive()) {
      pollRun(run).catch((e) => {
        run.status = 'error';
        run.note = String(e);
        finish(run, 'failure');
      });
    } else {
      run.status = 'error';
      run.done = true;
      run.note = 'Interrupted by a backend restart before the GitHub run was located — check GitHub Actions.';
    }
  }
}

loadRuns();

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
