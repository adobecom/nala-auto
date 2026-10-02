// nala-auto run-console backend: dispatch + live-track the screenshot-diff
// GitHub Actions workflow. Namespaced under /lab so it never collides with
// the existing /api (S3) and /nala (Jenkins) vite proxies.
/* global process, Buffer */
import http from 'node:http';
import { WebSocketServer } from 'ws';
import * as gh from './github.js';
import { createRun, getRun, attachClient, listRuns, onRunFinished } from './runner.js';
import { getCustomSites, addCustomSite, removeCustomSite, normalizeSiteName } from './customSites.js';
import { BUILTIN_SITES, allSites, siteGroups } from './workflowSites.js';
import { inspectDataset } from './datasets.js';
import { repoDatasets, datasetsForRepo, setRepoDatasets, normalizeRepo } from './repoDatasets.js';
import * as history from './visualHistory.js';
import { manualSessionConfig, createManualSession, endManualSession } from './manualSessions.js';
import * as aiJudge from './aiJudge.js';
import * as askAgent from './askAgent.js';
import { getRunnerStatus } from './runnerStatus.js';
import { getReleasePrs, releaseRepos } from './releasePrs.js';
import { getThumbnail, isSafeScreenshotPath, CACHE_CONTROL } from './thumbnails.js';

const PORT = process.env.LAB_PORT || 4000;

function send(res, status, body, headers = {}) {
  const data = Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;

    // Downscaled sidebar previews. Full-page screenshots are 1-2 MB each and a
    // dataset has ~190 of them, so the snapshot list asks for these few-KB
    // crops instead of the originals.
    if (p === '/lab/thumb' && req.method === 'GET') {
      const src = url.searchParams.get('p') || '';
      if (!isSafeScreenshotPath(src)) return send(res, 400, { error: 'bad path' });
      try {
        const { body, etag } = await getThumbnail(src, url.searchParams.get('w'));
        if (req.headers['if-none-match'] === etag) {
          res.writeHead(304, { ETag: etag, 'Cache-Control': CACHE_CONTROL });
          return res.end();
        }
        return send(res, 200, body, {
          'Content-Type': 'image/webp',
          'Cache-Control': CACHE_CONTROL,
          ETag: etag,
        });
      } catch (e) {
        return send(res, e.status || 502, { error: String(e.message || e) });
      }
    }

    if (p === '/lab/config' && req.method === 'GET') {
      return send(res, 200, {
        mode: gh.isLive() ? 'live' : 'mock',
        ...gh.config(),
        sites: allSites(getCustomSites()),
        groups: siteGroups(getCustomSites()),
        customSites: getCustomSites(),
        shards: ['chrome', 'ipad', 'iphone'],
        // Human names for the three viewport shards, used by the Figma compare
        // picker where one frame maps to exactly one of them.
        viewportLabels: { chrome: 'Desktop', ipad: 'Tablet', iphone: 'Mobile' },
        // Published results are pruned upstream — surface the limits so the
        // console never implies long-term archival.
        retention: {
          datasetKeepRuns: 3,
          datasetMaxDays: 7,
          oneOffMaxHours: 24,
        },
        // Latest 2 iPhone + 2 iPad models (all ship with Xcode 16.2 — no install).
        iosDevices: ['iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16', 'iPad Pro 11-inch (M4)', 'iPad Air 11-inch (M2)'],
        // Minimum iOS a device model can run — a model has no simulator build for
        // an iOS released before it (iPhone 16 needs iOS 18+). The console uses
        // this to only offer runnable device × version pairs.
        iosDeviceMinVersion: {
          'iPhone 16 Pro Max': '18.0',
          'iPhone 16 Pro': '18.0',
          'iPhone 16': '18.0',
          'iPad Pro 11-inch (M4)': '17.4',
          'iPad Air 11-inch (M2)': '17.5',
        },
        // iOS versions are capped at 18.x on this Intel fleet (Xcode 16.2). Add
        // more by downloading the runtime on the runners (simulators.sh ensure).
        iosVersions: ['18.3', '17.5'],
        // Target parallel iOS jobs (~= ios-sim runner count). Each device × version
        // is split into floor(iosRunners / combos) URL shards, so one device runs
        // across the whole fleet instead of one runner doing every URL serially.
        iosRunners: Math.max(1, Number(process.env.IOS_RUNNERS || 4)),
        defaultMilolibs: '?milolibs=stage',
        nalaAutoBase: process.env.NALA_AUTO_BASE || 'http://nala-auto.corp.adobe.com',
        manualIos: manualSessionConfig(),
        aiJudgeConfigured: aiJudge.isConfigured(),
        askAgentConfigured: askAgent.isConfigured(),
        askAgentModel: askAgent.config().model,
      });
    }

    // "AI Judge" button on the imagediff page: send one snapshot's
    // baseline/new/diff image paths, get back a vision-model verdict on
    // whether the diff is a real regression or noise. See aiJudge.js for the
    // pluggable provider config (env vars) and README.md for setup notes.
    // Gracefully reports "not configured" (200, not an error) instead of
    // failing when no AI_JUDGE_API_KEY is set, so the button always renders.
    if (p === '/lab/judge' && req.method === 'POST') {
      const { a, b, diff, regions } = await readBody(req);
      if (!a || !b) return send(res, 400, { error: 'missing a/b image paths' });
      if (!aiJudge.isConfigured()) {
        return send(res, 200, {
          configured: false,
          message: 'AI judge is not configured: set AI_FOUNDRY_API_KEY (uses the AI Foundry Qwen model) or AI_JUDGE_API_KEY (plus optional AI_JUDGE_PROVIDER / AI_JUDGE_BASE_URL / AI_JUDGE_MODEL) and restart the backend. See README.md.',
        });
      }
      try {
        const result = await aiJudge.judgeDiff({ a, b, diff, regions });
        // Remembered per run so the baseline report can show the verdict.
        history.recordJudgment(a, result).catch(() => {});
        return send(res, 200, { configured: true, ...result });
      } catch (e) {
        return send(res, 502, { configured: true, error: String(e.message || e) });
      }
    }

    // "Ask" chat panel: a read-only assistant over this console's own data
    // (recent runs, BC monitor checks, dataset results). Same "not configured
    // is a 200, not an error" contract as /lab/judge so the panel always
    // renders and can explain what an admin needs to set. See askAgent.js.
    if (p === '/lab/ask' && req.method === 'POST') {
      const { messages } = await readBody(req);
      if (!askAgent.isConfigured()) {
        return send(res, 200, {
          configured: false,
          message: 'Ask agent is not configured: set the AI_FOUNDRY_API_KEY environment variable (plus optional AI_FOUNDRY_BASE_URL / AI_FOUNDRY_MODEL) and restart the backend. See README.md.',
        });
      }
      try {
        const result = await askAgent.ask({ messages });
        return send(res, 200, { configured: true, ...result });
      } catch (e) {
        return send(res, 502, { configured: true, error: String(e.message || e) });
      }
    }

    // Persisted, shared "add dataset" list — not per-browser localStorage.
    // A site added here still needs to be run once (▶ Run Console) before
    // its screenshot-diff results exist to view.
    if (p === '/lab/sites' && req.method === 'GET') {
      return send(res, 200, { sites: getCustomSites(), groups: siteGroups(getCustomSites()) });
    }

    // Adding checks the dataset sheet is actually published first (a typo or
    // an unpublished sheet would otherwise only fail minutes into a run).
    // `force: true` adds it anyway, e.g. while the sheet is still being made.
    if (p === '/lab/sites' && req.method === 'POST') {
      const { name, force } = await readBody(req);
      const normalized = normalizeSiteName(name);
      if (!normalized) return send(res, 400, { error: 'invalid site name' });
      const dataset = await inspectDataset(normalized, { force: true });
      if (!dataset.exists && !force) {
        return send(res, 422, { error: dataset.message, dataset });
      }
      const added = addCustomSite(normalized);
      return send(res, 200, { site: added, sites: getCustomSites(), groups: siteGroups(getCustomSites()), dataset });
    }

    // Dataset preview: page count, wait strategy and first URLs of the sheet
    // the workflow will load. Built-in sites without a sheet fall back to the
    // committed sot.<site>.yml in the milo repo.
    const dsM = p.match(/^\/lab\/datasets\/([^/]+)$/);
    if (dsM && req.method === 'GET') {
      const name = normalizeSiteName(decodeURIComponent(dsM[1]));
      if (!name) return send(res, 400, { error: 'invalid dataset name' });
      const dataset = await inspectDataset(name, { force: url.searchParams.get('refresh') === '1' });
      if (!dataset.exists && BUILTIN_SITES.includes(name)) {
        dataset.fallback = `tools/screenshot-diff/lib/sot.${name}.yml`;
        dataset.message = `No published sheet; the workflow uses the committed ${dataset.fallback}.`;
      }
      return send(res, 200, dataset);
    }

    // Baseline + trend: per-page diff scores of every published run, compared
    // with the accepted baseline and the previous run (visualHistory.js).
    if (p === '/lab/history/run' && req.method === 'GET') {
      const site = url.searchParams.get('site') || '';
      if (!history.isSafeName(site)) return send(res, 400, { error: 'bad site' });
      try {
        return send(res, 200, await history.runReport(site, url.searchParams.get('run') || undefined));
      } catch (e) {
        return send(res, e.status || 502, { error: String(e.message || e) });
      }
    }
    if (p === '/lab/history/trend' && req.method === 'GET') {
      const site = url.searchParams.get('site') || '';
      if (!history.isSafeName(site)) return send(res, 400, { error: 'bad site' });
      return send(res, 200, await history.trend(site, Number(url.searchParams.get('limit')) || history.TREND_RUNS));
    }
    if (p === '/lab/history/baseline' && req.method === 'POST') {
      const { site, runId, keys, reset } = await readBody(req);
      if (!history.isSafeName(site)) return send(res, 400, { error: 'bad site' });
      try {
        if (reset) return send(res, 200, await history.resetBaseline(site, keys));
        if (!history.isSafeName(runId)) return send(res, 400, { error: 'bad run id' });
        return send(res, 200, await history.acceptBaseline(site, runId, keys));
      } catch (e) {
        return send(res, e.status || 500, { error: String(e.message || e) });
      }
    }

    // Repo -> datasets mapping, so any repo (not just milo) can run "its"
    // visual diff: from a Releases card, or from its own CI with
    //   curl -X POST $NALA/lab/repo-runs -d '{"repo":"adobecom/da-cc"}'
    if (p === '/lab/repo-datasets' && req.method === 'GET') {
      return send(res, 200, { repos: repoDatasets() });
    }
    if (p === '/lab/repo-datasets' && req.method === 'PUT') {
      const { repo, datasets } = await readBody(req);
      const list = setRepoDatasets(repo, datasets);
      if (!list) return send(res, 400, { error: 'repo must look like owner/name' });
      return send(res, 200, { repo: normalizeRepo(repo), datasets: list, repos: repoDatasets() });
    }
    if (p === '/lab/repo-runs' && req.method === 'POST') {
      const body = await readBody(req);
      const repo = normalizeRepo(body.repo);
      if (!repo) return send(res, 400, { error: 'repo must look like owner/name' });
      const datasets = Array.isArray(body.datasets) && body.datasets.length
        ? body.datasets.map(normalizeSiteName).filter((d) => datasetsForRepo(repo).includes(d))
        : datasetsForRepo(repo);
      if (!datasets.length) return send(res, 404, { error: `No datasets mapped to ${repo}. Map some on the Releases page.` });
      const started = [];
      const errors = [];
      for (const site of datasets) {
        try {
          const run = createRun({ site, milolibs: body.milolibs });
          started.push({ runId: run.id, site, resultsUrl: run.resultsUrl });
        } catch (e) {
          errors.push({ site, error: String(e.message || e) });
        }
      }
      return send(res, started.length ? 200 : 409, { repo, runs: started, errors });
    }

    const delM = p.match(/^\/lab\/sites\/([^/]+)$/);
    if (delM && req.method === 'DELETE') {
      removeCustomSite(decodeURIComponent(delM[1]));
      return send(res, 200, { sites: getCustomSites() });
    }

    // Self-hosted runner fleet (busy/idle/offline, queued jobs, recent jobs).
    if (p === '/lab/runners' && req.method === 'GET') {
      try {
        return send(res, 200, await getRunnerStatus());
      } catch (e) {
        return send(res, 502, { error: String(e.message || e) });
      }
    }

    // Release (stage -> main) PRs per repo: sign-offs, checks, bundled PRs.
    if (p === '/lab/releases/repos' && req.method === 'GET') {
      return send(res, 200, {
        repos: releaseRepos().map(({ id, name }) => ({ id, name, datasets: datasetsForRepo(id) })),
      });
    }
    if (p === '/lab/releases' && req.method === 'GET') {
      try {
        const params = new URL(req.url, 'http://x').searchParams;
        return send(res, 200, await getReleasePrs({ repo: params.get('repo'), force: params.get('refresh') === '1' }));
      } catch (e) {
        return send(res, e.status || 502, { error: String(e.message || e) });
      }
    }

    // Finished screenshot runs carry their baseline counts (new / changed /
    // fixed) so Recent runs can flag regressions without opening the viewer.
    if (p === '/lab/runs' && req.method === 'GET') {
      const list = listRuns();
      await Promise.all(list.map(async (run) => {
        if (run.runKind === 'screenshot' && run.done && run.mode === 'live') {
          run.history = await history.runSummary(run.site, run.runId).catch(() => null);
        }
      }));
      return send(res, 200, list);
    }

    if (p === '/lab/runs' && req.method === 'POST') {
      let run;
      try {
        run = createRun(await readBody(req));
      } catch (e) {
        return send(res, 400, { error: String(e.message || e) });
      }
      return send(res, 200, {
        runId: run.id,
        mode: run.mode,
        site: run.site,
        resultsUrl: run.resultsUrl,
        latestResultsUrl: run.latestResultsUrl,
      });
    }

    if (p === '/lab/manual-ios/session' && req.method === 'POST') {
      return send(res, 201, await createManualSession(await readBody(req)));
    }

    const manualMatch = p.match(/^\/lab\/manual-ios\/session\/([^/]+)$/);
    if (manualMatch && req.method === 'DELETE') {
      await endManualSession(decodeURIComponent(manualMatch[1]));
      return send(res, 204, '');
    }

    const m = p.match(/^\/lab\/runs\/([\w-]+)$/);
    if (m && req.method === 'GET') {
      const run = getRun(m[1]);
      return run ? send(res, 200, run.snapshot()) : send(res, 404, { error: 'not found' });
    }

    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e) });
  }
});

// Score a finished run once its results are published (the workflow's
// publish step lands a few seconds after the GitHub run completes).
onRunFinished((run) => {
  if (run.runKind !== 'screenshot' || run.mode !== 'live' || !history.isSafeName(run.site)) return;
  setTimeout(() => history.ensureMetrics(run.site, run.runId).catch((e) => {
    console.warn(`[nala-lab] history: ${run.site}/${run.runId} not scored:`, e.message);
  }), 15000);
});

const wss = new WebSocketServer({ server, path: '/lab/stream' });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  attachClient(url.searchParams.get('runId'), ws);
});

server.listen(PORT, () => {
  console.log(`[nala-lab] backend on http://localhost:${PORT}  mode=${gh.isLive() ? 'LIVE' : 'MOCK'}`);
  if (!gh.isLive()) {
    console.log('[nala-lab] MOCK mode: no GITHUB_TOKEN set, runs are simulated. See LAB.md to go live.');
  } else {
    // The first runner scan walks two weeks of job history; do it before anyone opens /runners.
    getRunnerStatus().catch((e) => console.warn('[nala-lab] runner status warm-up failed:', e.message));
  }
  // Score already-published runs (S3 keeps only ~3 per dataset, so this is
  // what seeds the trend after a deploy). Serial and low priority.
  if (process.env.HISTORY_BACKFILL !== '0') {
    setTimeout(() => history.backfill(allSites(getCustomSites()))
      .catch((e) => console.warn('[nala-lab] history backfill failed:', e.message)), 30000);
  }
});
