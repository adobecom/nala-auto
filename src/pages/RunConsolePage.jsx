import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import Breadcrumb from '../components/Breadcrumb';
import { fetchDatasetInfo } from '../lib/customDatasets';

// Explicit status colors so pills read clearly in both light and dark —
// the app toggles a `.dark` class rather than DaisyUI's data-theme, so we
// don't rely on DaisyUI semantic badge colors here.
const STATUS_STYLES = {
  success: 'bg-emerald-500 text-white',
  passed: 'bg-emerald-500 text-white',
  failure: 'bg-rose-500 text-white',
  failed: 'bg-rose-500 text-white',
  in_progress: 'bg-sky-500 text-white',
  queued: 'bg-amber-400 text-slate-900',
  waiting: 'bg-amber-400 text-slate-900',
  dispatching: 'bg-sky-500 text-white',
  'locating run': 'bg-sky-500 text-white',
  completed: 'bg-slate-400 text-white',
  error: 'bg-rose-600 text-white',
};
const statusText = (status, conclusion) => (status === 'completed' ? conclusion || 'done' : status);const statusCls = (status, conclusion) =>
  STATUS_STYLES[statusText(status, conclusion)] || 'bg-slate-400 text-white';

const fmtDuration = (ms) => {
  if (!(ms > 0)) return '';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

const renderPill = (status, conclusion) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusCls(status, conclusion)}`}
  >
    {status === 'in_progress' && (
      <span className="inline-block h-2 w-2 animate-ping rounded-full bg-white/90" />
    )}
    {statusText(status, conclusion)}
  </span>
);

// Mirrors server/figmaCompare.js so a bad paste is explained while typing
// instead of failing on dispatch. Each returns an error string, or null when ok.
const FIGMA_PATH = /^\/(design|file|proto|board|slides)\/([A-Za-z0-9]{10,})(?:\/|$)/;
const SELECTOR_MAX = 200;

const webUrlError = (raw) => {
  const v = (raw || '').trim();
  if (!v) return null;
  return /^https?:\/\/\S+$/i.test(v) ? null : `Not a valid web page URL: ${v}`;
};

const figmaUrlError = (raw) => {
  const v = (raw || '').trim();
  if (!v) return null;
  let url;
  try {
    url = new URL(v);
  } catch {
    return `Not a valid Figma URL: ${v}`;
  }
  if (!/(^|\.)figma\.com$/i.test(url.hostname)) return `Not a figma.com URL: ${url.hostname}`;
  if (!FIGMA_PATH.exec(url.pathname)) return 'Figma URL must contain a file key, e.g. https://www.figma.com/design/<fileKey>/…';
  const nodeId = (url.searchParams.get('node-id') || '').trim();
  if (!nodeId) return 'Figma URL is missing node-id — use "Copy link to selection" on the frame in Figma.';
  if (!/^\d+[-:]\d+$/.test(nodeId)) return `Not a valid Figma node-id: ${nodeId}`;
  return null;
};

const selectorError = (raw) => {
  const v = (raw || '').trim();
  if (!v) return null;
  if (v.length > SELECTOR_MAX) return `Selector is too long (max ${SELECTOR_MAX} characters).`;
  return null;
};

// SharePoint folder where the screenshot-diff baseline data is updated.
const DATA_URL =
  'https://adobe.sharepoint.com/sites/adobecom/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2Fadobecom%2FShared%20Documents%2Fmilo%2Fdrafts%2Fnala%2Fscreenshotdiff%2Fdata&viewid=d776cf70%2D9b7e%2D4ab7%2Db9da%2D9e0f8e03a7d2';

const RunConsolePage = () => {
  const [searchParams] = useSearchParams();
  const preselectedSite = searchParams.get('site');
  const initialKind = ['screenshot', 'quick', 'ios', 'figma'].includes(searchParams.get('mode')) ? searchParams.get('mode') : 'screenshot';
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState('MILOCORE');
  const [config, setConfig] = useState(null);
  const [kind, setKind] = useState(initialKind); // 'screenshot' | 'quick' | 'ios' | 'figma'
  const [quickUrls, setQuickUrls] = useState('');
  const [quickViewports, setQuickViewports] = useState(['chrome', 'ipad', 'iphone']);
  const [figmaWebUrl, setFigmaWebUrl] = useState('');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [figmaSelector, setFigmaSelector] = useState('');
  // A Figma frame is drawn at one width, so a compare run targets exactly one viewport.
  const [figmaViewport, setFigmaViewport] = useState('chrome');
  const [site, setSite] = useState(preselectedSite || 'bacom');
  const [milolibs, setMilolibs] = useState('?milolibs=stage');
  const [selDevices, setSelDevices] = useState(['iPhone 15']);
  const [selVersions, setSelVersions] = useState(['18.3']);
  const [run, setRun] = useState(null);
  const [datasetInfo, setDatasetInfo] = useState(null);
  const [runs, setRuns] = useState([]);
  // Last finished run time per dataset: { screenshot: { milo: { ms, at, conclusion } } }.
  const [durations, setDurations] = useState({});
  // Only true while the POST is in flight: a live run elsewhere must not lock
  // the button for other datasets (the backend refuses true duplicates).
  const [submitting, setSubmitting] = useState(false);
  const wsRef = useRef(null);
  const selectedRef = useRef(null);

  useEffect(() => {
    if (localStorage.getItem('theme') === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    fetch('/lab/config')
      .then((r) => r.json())
      .then((c) => {
        setConfig(c);
        if (preselectedSite && c.sites?.includes(preselectedSite)) setSite(preselectedSite);
        else if (c.sites?.length) setSite(c.sites[0]);
        if (c.defaultMilolibs) setMilolibs(c.defaultMilolibs);
        if (c.iosDevices?.length) setSelDevices(c.iosDevices.slice(0, 1));
        if (c.iosVersions?.length) setSelVersions(c.iosVersions.slice(0, 2));
      })
      .catch(() =>
        setConfig({
          mode: 'mock',
          sites: ['bacom'],
          shards: ['chrome', 'ipad', 'iphone'],
          iosDevices: ['iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16', 'iPad Pro 11-inch (M4)', 'iPad Air 11-inch (M2)'],
          iosDeviceMinVersion: {
            'iPhone 16 Pro Max': '18.0', 'iPhone 16 Pro': '18.0', 'iPhone 16': '18.0',
            'iPad Pro 11-inch (M4)': '17.4', 'iPad Air 11-inch (M2)': '17.5',
          },
          iosVersions: ['18.3', '17.5'],
          iosRunners: 4,
          defaultMilolibs: '?milolibs=stage',
          error: 'backend not reachable — start it with `cd server && npm i && npm start`',
        })
      );
    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch { /* noop */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshDurations = () => {
    fetch('/lab/durations').then((r) => r.json()).then(setDurations).catch(() => {});
  };
  const refreshRuns = () => {
    fetch('/lab/runs').then((r) => r.json()).then(setRuns).catch(() => {});
    refreshDurations();
  };

  const closeStream = () => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* noop */ }
      wsRef.current = null;
    }
  };

  const openStream = (runId) => {
    closeStream();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/lab/stream?runId=${runId}`);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      // A stream that was replaced (user picked another run) must not
      // overwrite the selection with its own updates.
      if (wsRef.current !== ws) return;
      const m = JSON.parse(ev.data);
      if (m.kind === 'update' && m.runId === runId) {
        setRun(m);
        if (m.done) refreshRuns();
      }
    };
  };

  const attachToRun = async (runId) => {
    // Drop the previous run's live stream first, otherwise its next update
    // snaps the panel back to it right after the user clicked another run.
    closeStream();
    selectedRef.current = runId;
    try {
      const snap = await (await fetch(`/lab/runs/${runId}`)).json();
      if (selectedRef.current !== runId) return; // a later click won
      setRun(snap);
      if (!snap.done) openStream(runId);
    } catch { /* noop */ }
  };

  // Keep the list (and the per-dataset "already running" lock) fresh while
  // anything is live, including runs started from another tab.
  const anyLive = runs.some((r) => !r.done);
  useEffect(() => {
    if (!anyLive) return undefined;
    const t = setInterval(refreshRuns, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyLive]);

  // On load, rediscover runs so a page refresh reconnects to an in-flight run.
  useEffect(() => {
    refreshDurations();
    fetch('/lab/runs')
      .then((r) => r.json())
      .then((list) => {
        setRuns(list);
        const active = list.find((r) => !r.done);
        if (active) attachToRun(active.runId);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleThemeToggle = () => {
    setIsDarkMode((v) => {
      const nv = !v;
      document.documentElement.classList.toggle('dark', nv);
      localStorage.setItem('theme', nv ? 'dark' : 'light');
      return nv;
    });
  };

  const toggleVersion = (v) =>
    setSelVersions((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  const toggleViewport = (v) =>
    setQuickViewports((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  // Mirrors the backend's parseQuickUrls() so problems show while typing.
  const QUICK_MAX = 30;
  const quickLines = quickUrls.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const quickBad = quickLines.filter((l) => {
    const parts = l.split('|').map((x) => x.trim());
    return parts.length > 2 || !parts.filter(Boolean).every((u) => /^https?:\/\/\S+$/i.test(u));
  });
  const quickError = quickBad.length
    ? `Not a valid URL line: ${quickBad[0]}${quickBad.length > 1 ? ` (+${quickBad.length - 1} more)` : ''}`
    : quickLines.length > QUICK_MAX
      ? `Quick run is capped at ${QUICK_MAX} URLs — add a dataset for bigger lists.`
      : null;

  const toggleDevice = (d) =>
    setSelDevices((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  // A device model has no simulator build for an iOS released before it (iPhone 16
  // needs iOS 18+). Only offer/count device × version pairs that can actually run,
  // so we never dispatch a run that silently falls back or reports "no device".
  const cmpVer = (a, b) =>
    a.split('.').reduce((acc, n, i) => acc || Number(n) - (Number(b.split('.')[i]) || 0), 0);
  const minVer = (d) => (config?.iosDeviceMinVersion || {})[d] || '0';
  const pairRunnable = (d, v) => cmpVer(v, minVer(d)) >= 0;
  const deviceBlocked = (d) => selVersions.length > 0 && selVersions.every((v) => !pairRunnable(d, v));
  const deviceConstrained = (d) => (config?.iosVersions || []).some((v) => !pairRunnable(d, v));
  const runnablePairs = selDevices.flatMap((d) => selVersions.filter((v) => pairRunnable(d, v)).map((v) => `${d} · iOS ${v}`));
  const skippedPairs = selDevices.flatMap((d) => selVersions.filter((v) => !pairRunnable(d, v)).map((v) => `${d} · iOS ${v} (needs ${minVer(d)}+)`));

  // Each combo's URLs are split across ~iosRunners runners: one device fans out
  // over the whole fleet, many combos stay at 1 shard each (still one wave).
  const iosRunners = Math.max(1, Number(config?.iosRunners || 4));
  const combos = runnablePairs.length;
  const shards = Math.max(1, Math.floor(iosRunners / Math.max(1, combos)));
  const parallelJobs = combos * shards;

  const figmaWebError = webUrlError(figmaWebUrl);
  const figmaLinkError = figmaUrlError(figmaUrl);
  const figmaSelError = selectorError(figmaSelector);
  const figmaReady =
    !!figmaWebUrl.trim() && !!figmaUrl.trim() && !!figmaSelector.trim() &&
    !figmaWebError && !figmaLinkError && !figmaSelError && !!figmaViewport;

  const sessions =
    kind === 'ios' ? combos
      : kind === 'quick' ? quickViewports.length
        : kind === 'figma' ? 1
          : (config?.shards?.length || 3);
  // Same kind + dataset already live? Running it again would race on its results.
  const sameRunning = (kind === 'screenshot' || kind === 'ios')
    ? runs.find((r) => !r.done && (r.runKind || 'screenshot') === kind && r.site === site)
    : null;
  const canRun = !submitting && !sameRunning && (kind === 'ios'
    ? combos > 0
    : kind === 'quick'
      ? quickLines.length > 0 && !quickError && quickViewports.length > 0
      : kind === 'figma'
        ? figmaReady
        : true);

  const start = async () => {
    setSubmitting(true);
    selectedRef.current = null;
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch { /* noop */ }
    }
    const body =
      kind === 'ios'
        ? { kind, site, milolibs, iosVersions: selVersions, devices: selDevices }
        : kind === 'quick'
          ? { kind, milolibs, urls: quickUrls, viewports: quickViewports }
          : kind === 'figma'
            ? {
                kind,
                milolibs,
                urls: figmaWebUrl.trim(),
                figmaUrl: figmaUrl.trim(),
                selector: figmaSelector.trim(),
                viewports: [figmaViewport],
              }
            : { kind, site, milolibs };
    try {
      const res = await fetch('/lab/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 400) throw new Error((await res.json().catch(() => ({}))).error || 'invalid request');
      if (!res.ok) throw new Error(`backend returned ${res.status} — is the /lab server (server/) running on :4000?`);
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('backend not reachable — start it with `cd server && npm start`');
      }
      setRun({
        runId: data.runId,
        runKind: kind,
        site: data.site || site,
        milolibs,
        viewports: kind === 'quick' ? quickViewports : kind === 'figma' ? [figmaViewport] : undefined,
        figmaUrl: kind === 'figma' ? figmaUrl.trim() : undefined,
        selector: kind === 'figma' ? figmaSelector.trim() : undefined,
        devices: selDevices,
        mode: data.mode,
        status: 'dispatching',
        jobs: [],
        conclusion: null,
        htmlUrl: null,
        resultsUrl: data.resultsUrl,
        latestResultsUrl: data.latestResultsUrl,
        done: false,
      });
      openStream(data.runId);
      refreshRuns();
    } catch (e) {
      setRun({ status: 'error', note: e.message || String(e), jobs: [] });
    } finally {
      setSubmitting(false);
    }
  };

  const viewportLabel = (v) => (config?.viewportLabels || { chrome: 'Desktop', ipad: 'Tablet', iphone: 'Mobile' })[v] || v;

  // Preview of the dataset sheet the screenshot workflow will load.
  useEffect(() => {
    if (kind !== 'screenshot' || !site) return undefined;
    let alive = true;
    setDatasetInfo({ loading: true, name: site });
    fetchDatasetInfo(site).then((info) => { if (alive) setDatasetInfo(info); });
    return () => { alive = false; };
  }, [kind, site]);

  const refreshDatasetInfo = () => {
    setDatasetInfo({ loading: true, name: site });
    fetchDatasetInfo(site, { refresh: true }).then(setDatasetInfo);
  };

  // One-line description of a run, used by both Recent runs and the live panel.
  const runLabel = (r) => {
    if (r.runKind === 'ios') return `iOS · ${(r.devices || [r.device]).filter(Boolean).join(', ')}`;
    if (r.runKind === 'quick') {
      const n = (r.urls || []).length;
      return `⚡ Quick · ${n} URL${n === 1 ? '' : 's'}`;
    }
    if (r.runKind === 'figma') return `🎨 Figma · ${(r.viewports || []).map(viewportLabel).join(', ')}`;
    return 'Viewport';
  };
  // Published results are pruned upstream — never imply long-term archival.
  const retention = { datasetKeepRuns: 3, datasetMaxDays: 7, oneOffMaxHours: 24, ...(config?.retention || {}) };

  const isMock = config?.mode !== 'live';
  const durationKind = kind === 'ios' ? 'ios' : 'screenshot';
  const lastDuration = durations[durationKind]?.[site];
  const siteOptionLabel = (s) => {
    const d = durations[durationKind]?.[s];
    return d ? `${s} · last ${fmtDuration(d.ms)}` : s;
  };
  const pacificTime = (timestamp) =>
    timestamp
      ? new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Los_Angeles',
          hour: 'numeric',
          minute: '2-digit',
          month: 'short',
          day: 'numeric',
          timeZoneName: 'short',
        }).format(new Date(timestamp))
      : '';
  const page = isDarkMode ? 'bg-black' : 'bg-gray-50';
  const card = isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200';
  const text = isDarkMode ? 'text-gray-100' : 'text-gray-900';
  const subtle = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const field = isDarkMode
    ? 'bg-gray-800 border-gray-700 text-gray-100'
    : 'bg-white border-gray-300 text-gray-900';

  const chip = (selected, disabled) =>
    `rounded-full border px-3 py-1 text-sm font-medium transition ${
      disabled
        ? 'cursor-not-allowed opacity-40 border-gray-400'
        : selected
          ? 'border-transparent bg-indigo-600 text-white shadow'
          : isDarkMode
            ? 'border-gray-700 text-gray-300 hover:border-gray-500'
            : 'border-gray-300 text-gray-700 hover:border-gray-400'
    }`;

  const segBtn = (active) =>
    `px-4 py-2 text-sm font-semibold rounded-md transition ${
      active ? 'bg-indigo-600 text-white shadow' : `${subtle} hover:${text}`
    }`;

  return (
    <div className={`${page} min-h-screen`}>
      <Header
        isDarkMode={isDarkMode}
        handleThemeToggle={handleThemeToggle}
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
      />
      <Breadcrumb items={[{ label: 'Run Console' }]} isDarkMode={isDarkMode} activeMenu={activeMenu} />

      <div className="container mx-auto max-w-5xl p-4">
        <div className="mb-5 flex items-center gap-3">
          <h1 className={`text-2xl font-bold ${text}`}>Test Lab — Run Console</h1>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              isMock ? 'bg-amber-400 text-slate-900' : 'bg-emerald-500 text-white'
            }`}
          >
            {isMock ? 'MOCK' : 'LIVE'}
          </span>
          <a
            href={DATA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-sm text-sky-500 hover:underline"
            title="Where the screenshot-diff baseline data is updated (SharePoint)"
          >
            📁 Baseline data ↗
          </a>
        </div>

        {isMock && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Mock mode — no <code>GITHUB_TOKEN</code> on the backend, so runs are simulated. Add a
            token to dispatch the real workflows. See <code>LAB.md</code>.
          </div>
        )}
        {config?.error && (
          <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {config.error}
          </div>
        )}

        {/* Controls */}
        <div className={`mb-6 rounded-xl border shadow-sm ${card}`}>
          <div className="space-y-5 p-5">
            {/* Run type */}
            <div className={`inline-flex gap-1 rounded-lg border p-1 ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
              <button className={segBtn(kind === 'screenshot')} onClick={() => setKind('screenshot')}>
                Viewport diff
              </button>
              <button className={segBtn(kind === 'quick')} onClick={() => setKind('quick')}>
                ⚡ Quick run
              </button>
              <button className={segBtn(kind === 'figma')} onClick={() => setKind('figma')}>
                🎨 Figma compare
              </button>
              <button className={segBtn(kind === 'ios')} onClick={() => setKind('ios')}>
                Real iOS · Simulator
              </button>
            </div>

            {kind === 'figma' && (
              <div className="space-y-4">
                <label className="block">
                  <span className={`mb-1 block text-sm font-medium ${subtle}`}>Web page URL</span>
                  <input
                    className={`w-full rounded-lg border px-3 py-2 font-mono text-sm ${field}`}
                    value={figmaWebUrl}
                    onChange={(e) => setFigmaWebUrl(e.target.value)}
                    spellCheck={false}
                    placeholder="https://business.adobe.com/products/genstudio.html"
                  />
                  <span className={`mt-1 block text-xs ${figmaWebError ? 'text-rose-500' : subtle}`}>
                    {figmaWebError || 'The live page whose rendered region is compared against the design.'}
                  </span>
                </label>

                <label className="block">
                  <span className={`mb-1 block text-sm font-medium ${subtle}`}>Figma design or prototype URL</span>
                  <input
                    className={`w-full rounded-lg border px-3 py-2 font-mono text-sm ${field}`}
                    value={figmaUrl}
                    onChange={(e) => setFigmaUrl(e.target.value)}
                    spellCheck={false}
                    placeholder="https://www.figma.com/design/AbCdEf123456/Marquee?node-id=12-345"
                  />
                  <span className={`mt-1 block text-xs ${figmaLinkError ? 'text-rose-500' : subtle}`}>
                    {figmaLinkError || 'Select the frame in Figma → right-click → Copy link to selection, so the URL carries both the file key and node-id.'}
                  </span>
                </label>

                <label className="block">
                  <span className={`mb-1 block text-sm font-medium ${subtle}`}>CSS selector (required)</span>
                  <input
                    className={`w-full rounded-lg border px-3 py-2 font-mono text-sm ${field}`}
                    value={figmaSelector}
                    onChange={(e) => setFigmaSelector(e.target.value)}
                    spellCheck={false}
                    placeholder=".marquee.split"
                  />
                  <span className={`mt-1 block text-xs ${figmaSelError ? 'text-rose-500' : subtle}`}>
                    {figmaSelError
                      || 'The selector identifies the DOM region on the page that corresponds to the Figma node — only that element is captured and diffed, not the whole page.'}
                  </span>
                </label>

                <div>
                  <div className={`mb-2 text-sm font-medium ${subtle}`}>
                    Viewport — pick exactly one (a Figma frame is drawn at a single width)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(config?.shards || ['chrome', 'ipad', 'iphone']).map((v) => (
                      <button
                        key={v}
                        className={chip(figmaViewport === v, false)}
                        onClick={() => setFigmaViewport(v)}
                      >
                        {viewportLabel(v)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`rounded-lg px-3 py-2 text-xs ${isDarkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                  Results publish to their own one-off dataset, <code>figma-&lt;runId&gt;</code>, and are kept for {retention.oneOffMaxHours}h.
                </div>
              </div>
            )}

            {kind === 'quick' && (
              <label className="block">
                <span className={`mb-1 flex items-baseline justify-between text-sm font-medium ${subtle}`}>
                  <span>URLs — one per line</span>
                  <span className={quickLines.length > QUICK_MAX ? 'text-rose-500' : ''}>
                    {quickLines.length}/{QUICK_MAX}
                  </span>
                </span>
                <textarea
                  className={`h-36 w-full rounded-lg border px-3 py-2 font-mono text-sm ${field}`}
                  value={quickUrls}
                  onChange={(e) => setQuickUrls(e.target.value)}
                  spellCheck={false}
                  placeholder={'https://business.adobe.com/products/genstudio.html\nhttps://main--da-bacom--adobecom.aem.live/x | https://stage--da-bacom--adobecom.aem.live/x'}
                />
                <span className={`mt-1 block text-xs ${quickError ? 'text-rose-500' : subtle}`}>
                  {quickError || 'A plain URL is compared against itself + the candidate query below. Use "A | B" to compare two different URLs.'}
                </span>
              </label>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {kind !== 'quick' && kind !== 'figma' && (
              <label className="block">
                <span className={`mb-1 block text-sm font-medium ${subtle}`}>Site</span>
                <select
                  className={`w-full rounded-lg border px-3 py-2 ${field}`}
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                >
                  {config?.groups
                    ? Object.entries(config.groups).filter(([, list]) => list.length).map(([g, list]) => (
                      <optgroup key={g} label={g}>
                        {list.map((s) => <option key={s} value={s}>{siteOptionLabel(s)}</option>)}
                      </optgroup>
                    ))
                    : (config?.sites || []).map((s) => (
                      <option key={s} value={s}>
                        {siteOptionLabel(s)}
                      </option>
                    ))}
                </select>
                {lastDuration && (
                  <span className={`mt-1 block text-xs ${subtle}`} title={`Run #${lastDuration.runId || '?'} · ${lastDuration.conclusion}`}>
                    ⏱ Last run took <span className="font-semibold">{fmtDuration(lastDuration.ms)}</span>
                    {' '}· {pacificTime(lastDuration.at)}
                  </span>
                )}
              </label>
              )}
              <label className="block">
                <span className={`mb-1 block text-sm font-medium ${subtle}`}>Candidate (milo_libs query)</span>
                <input
                  className={`w-full rounded-lg border px-3 py-2 ${field}`}
                  value={milolibs}
                  onChange={(e) => setMilolibs(e.target.value)}
                  placeholder="?milolibs=stage"
                />
              </label>
            </div>

            {kind === 'screenshot' && datasetInfo && (
              <div className={`rounded-lg border px-3 py-2 text-xs ${isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
                {datasetInfo.loading ? (
                  <span className={subtle}>Checking dataset sheet…</span>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-semibold ${datasetInfo.exists ? 'text-emerald-600' : datasetInfo.fallback ? subtle : 'text-amber-600'}`}>
                        {datasetInfo.exists ? `✓ ${datasetInfo.pages} pages` : datasetInfo.fallback ? 'Repo yml' : '⚠ No published sheet'}
                      </span>
                      {datasetInfo.exists && (
                        <span className={subtle}>
                          wait: {datasetInfo.waitStrategy || 'default'}
                          {datasetInfo.ignored ? ` · ${datasetInfo.ignored} ignored` : ''}
                          {datasetInfo.pairMode ? ` · ${datasetInfo.pairMode} A|B pairs` : ''}
                          {datasetInfo.withOptions ? ` · ${datasetInfo.withOptions} with mask/wait` : ''}
                          {datasetInfo.invalid ? ` · ${datasetInfo.invalid} invalid rows` : ''}
                        </span>
                      )}
                      {datasetInfo.url && (
                        <a href={datasetInfo.url} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">
                          sheet ↗
                        </a>
                      )}
                      <button type="button" onClick={refreshDatasetInfo} className="ml-auto text-indigo-500 hover:underline">
                        Refresh
                      </button>
                    </div>
                    {datasetInfo.message && <div className={`mt-1 ${subtle}`}>{datasetInfo.message}</div>}
                    {datasetInfo.sample?.length > 0 && (
                      <ul className={`mt-1 space-y-0.5 font-mono ${subtle}`}>
                        {datasetInfo.sample.map((row) => (
                          <li key={row.key} className="truncate" title={row.a}>
                            {row.key}: {row.a}{row.b ? ` | ${row.b}` : ''}
                          </li>
                        ))}
                        {datasetInfo.pages > datasetInfo.sample.length && <li>… {datasetInfo.pages - datasetInfo.sample.length} more</li>}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            {kind === 'figma' ? null : kind === 'quick' ? (
              <div>
                <div className={`mb-2 text-sm font-medium ${subtle}`}>
                  Viewports — pick any; each is a parallel job
                </div>
                <div className="flex flex-wrap gap-2">
                  {['chrome', 'ipad', 'iphone'].map((v) => (
                    <button key={v} className={chip(quickViewports.includes(v), false)} onClick={() => toggleViewport(v)}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ) : kind === 'screenshot' ? (
              <div>
                <div className={`mb-2 text-sm font-medium ${subtle}`}>
                  Viewports — parallel shards on self-hosted macOS runners
                </div>
                <div className="flex flex-wrap gap-2">
                  {(config?.shards || ['chrome', 'ipad', 'iphone']).map((s) => (
                    <span key={s} className={chip(true, false)}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className={`mb-2 text-sm font-medium ${subtle}`}>
                    Devices — pick one or more (each device × version is one parallel job)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(config?.iosDevices || ['iPhone 15']).map((d) => {
                      const blocked = deviceBlocked(d);
                      return (
                        <button
                          key={d}
                          className={chip(selDevices.includes(d), false)}
                          style={blocked ? { opacity: 0.5, boxShadow: 'inset 0 0 0 1.5px #f59e0b' } : undefined}
                          title={blocked ? `Needs iOS ${minVer(d)}+ — not runnable on the selected iOS version(s)` : undefined}
                          onClick={() => toggleDevice(d)}
                        >
                          {d}
                          {deviceConstrained(d) && (
                            <span className="ml-1 opacity-60">· iOS {minVer(d)}+</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className={`mb-2 text-sm font-medium ${subtle}`}>
                    iOS versions — real Mobile Safari via Appium + Simulator (pick any)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(config?.iosVersions || ['18.3']).map((v) => (
                      <button
                        key={v}
                        className={chip(selVersions.includes(v), false)}
                        onClick={() => toggleVersion(v)}
                      >
                        iOS {v}
                      </button>
                    ))}
                  </div>
                </div>
                {skippedPairs.length > 0 && (
                  <div
                    className="rounded-lg px-3 py-2 text-xs"
                    style={{
                      background: isDarkMode ? '#3f2d0b' : '#fef3c7',
                      color: isDarkMode ? '#fcd34d' : '#92400e',
                    }}
                  >
                    ⚠ Won&apos;t run (model needs a newer iOS): {skippedPairs.join(', ')}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-4 border-t pt-4" style={{ borderColor: isDarkMode ? '#1f2937' : '#e5e7eb' }}>
              <span className={`text-sm ${subtle}`}>
                {kind === 'ios'
                  ? `${combos} combo${combos === 1 ? '' : 's'}${shards > 1 ? ` × ${shards} shards → ${parallelJobs} parallel jobs` : ` → ${parallelJobs} parallel job${parallelJobs === 1 ? '' : 's'}`}`
                  : `${sessions} session${sessions === 1 ? '' : 's'}`}
              </span>
              <button
                className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white shadow transition hover:bg-indigo-700 disabled:opacity-50"
                onClick={start}
                disabled={!canRun}
              >
                {submitting ? 'Starting…' : sameRunning ? `${site} running…` : '▶ Run'}
              </button>
            </div>
          </div>
        </div>

        {/* Recent runs — survives refresh; click to re-attach (resumes live stream if running) */}
        {runs.length > 0 && (
          <div className={`mb-6 rounded-xl border shadow-sm ${card}`}>
            <div className="p-4">
              <div className={`mb-2 text-sm font-medium ${subtle}`}>Recent runs</div>
              <div className="flex flex-col gap-1">
                {runs.slice(0, 8).map((r) => (
                  <button
                    key={r.runId}
                    onClick={() => attachToRun(r.runId)}
                    className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm ${
                      run && run.runId === r.runId
                        ? isDarkMode
                          ? 'bg-gray-800'
                          : 'bg-gray-100'
                        : isDarkMode
                          ? 'hover:bg-gray-800'
                          : 'hover:bg-gray-50'
                    }`}
                  >
                    {renderPill(r.status, r.conclusion)}
                    <span className={`font-mono ${subtle}`}>#{r.runId}</span>
                    <span className={text}>{runLabel(r)}</span>
                    <span className={`${subtle} truncate`}>{r.site}</span>
                    {r.startedAt && <span className={`text-xs ${subtle}`}>{pacificTime(r.startedAt)}</span>}
                    {r.done && r.finishedAt && <span className={`text-xs ${subtle}`}>took {fmtDuration(r.finishedAt - r.startedAt)}</span>}
                    {!r.done && durations[r.runKind]?.[r.site] && (
                      <span className={`text-xs ${subtle}`}>last took {fmtDuration(durations[r.runKind][r.site].ms)}</span>
                    )}
                    {r.history?.state === 'pending' && <span className={`text-xs ${subtle}`}>scoring…</span>}
                    {r.history?.state === 'ready' && (
                      <span
                        className="flex gap-1 text-xs"
                        title={`vs baseline / previous run${r.history.previousRunId ? ` #${r.history.previousRunId}` : ''}`}
                      >
                        {r.history.counts.changed > 0 && <span className="rounded bg-amber-500/15 px-1.5 text-amber-600">{r.history.counts.changed} changed</span>}
                        {r.history.counts.new > 0 && <span className="rounded bg-sky-500/15 px-1.5 text-sky-600">{r.history.counts.new} new</span>}
                        {r.history.counts.missing > 0 && <span className="rounded bg-rose-500/15 px-1.5 text-rose-600">{r.history.counts.missing} missing</span>}
                        {r.history.counts.flaky > 0 && <span className="rounded bg-gray-500/15 px-1.5">{r.history.counts.flaky} flaky</span>}
                        {!r.history.counts.changed && !r.history.counts.new && !r.history.counts.missing && (
                          <span className="rounded bg-emerald-500/15 px-1.5 text-emerald-600">no change</span>
                        )}
                      </span>
                    )}
                    {!r.done && <span className="ml-auto text-xs font-semibold text-sky-500">● live</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Live run panel */}
        {run && (
          <div className={`rounded-xl border shadow-sm ${card}`}>
            <div className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className={`text-lg font-semibold ${text}`}>Run {run.runId ? `#${run.runId}` : ''}</h2>
                  {renderPill(run.status, run.conclusion)}
                  <span className={`text-sm ${subtle}`}>
                    {runLabel(run)} · {run.site} · {run.milolibs}
                  </span>
                  {run.runKind === 'figma' && run.selector && (
                    <span className={`font-mono text-xs ${subtle}`} title={run.figmaUrl}>
                      {run.selector}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {run.htmlUrl && (
                    <a
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${isDarkMode ? 'text-gray-200 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100'}`}
                      href={run.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on GitHub ↗
                    </a>
                  )}
                  {run.done && run.resultsUrl && (
                    <a
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
                      href={run.resultsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Results in New Tab ↗
                    </a>
                  )}
                </div>
              </div>

              {run.note && (
                <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {run.note}
                </div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {(run.jobs || []).map((j, i) => (
                  <div
                    key={j.name || i}
                    className={`rounded-lg border p-3 ${isDarkMode ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate font-mono text-sm ${text}`}>{j.name}</span>
                      {renderPill(j.status, j.conclusion)}
                    </div>
                    {j.htmlUrl && (
                      <a
                        className="text-xs text-sky-500 hover:underline"
                        href={j.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        job log ↗
                      </a>
                    )}
                  </div>
                ))}
                {(!run.jobs || run.jobs.length === 0) && (
                  <div className={`text-sm ${subtle}`}>Waiting for jobs to start…</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RunConsolePage;
