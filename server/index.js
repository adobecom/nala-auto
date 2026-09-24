// nala-auto run-console backend: dispatch + live-track the screenshot-diff
// GitHub Actions workflow. Namespaced under /lab so it never collides with
// the existing /api (S3) and /nala (Jenkins) vite proxies.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import * as gh from './github.js';
import { createRun, getRun, attachClient, listRuns } from './runner.js';
import { getCustomSites, addCustomSite, removeCustomSite } from './customSites.js';
import { BUILTIN_SITES } from './workflowSites.js';

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

    if (p === '/lab/config' && req.method === 'GET') {
      return send(res, 200, {
        mode: gh.isLive() ? 'live' : 'mock',
        ...gh.config(),
        sites: [...BUILTIN_SITES, ...getCustomSites().filter((s) => !BUILTIN_SITES.includes(s))],
        customSites: getCustomSites(),
        shards: ['chrome', 'ipad', 'iphone'],
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
      });
    }

    // Persisted, shared "add dataset" list — not per-browser localStorage.
    // A site added here still needs to be run once (▶ Run Console) before
    // its screenshot-diff results exist to view.
    if (p === '/lab/sites' && req.method === 'GET') {
      return send(res, 200, { sites: getCustomSites() });
    }

    if (p === '/lab/sites' && req.method === 'POST') {
      const { name } = await readBody(req);
      const added = addCustomSite(name);
      if (!added) return send(res, 400, { error: 'invalid site name' });
      return send(res, 200, { site: added, sites: getCustomSites() });
    }

    const delM = p.match(/^\/lab\/sites\/([^/]+)$/);
    if (delM && req.method === 'DELETE') {
      removeCustomSite(decodeURIComponent(delM[1]));
      return send(res, 200, { sites: getCustomSites() });
    }

    if (p === '/lab/runs' && req.method === 'GET') {
      return send(res, 200, listRuns());
    }

    if (p === '/lab/runs' && req.method === 'POST') {
      const run = createRun(await readBody(req));
      return send(res, 200, { runId: run.id, mode: run.mode, resultsUrl: run.resultsUrl });
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

const wss = new WebSocketServer({ server, path: '/lab/stream' });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  attachClient(url.searchParams.get('runId'), ws);
});

server.listen(PORT, () => {
  console.log(`[nala-lab] backend on http://localhost:${PORT}  mode=${gh.isLive() ? 'LIVE' : 'MOCK'}`);
  if (!gh.isLive()) {
    console.log('[nala-lab] MOCK mode: no GITHUB_TOKEN set, runs are simulated. See LAB.md to go live.');
  }
});
