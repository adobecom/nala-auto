import { useEffect, useRef, useState } from 'react';
import Header from '../components/Header';
import Breadcrumb from '../components/Breadcrumb';

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
const statusText = (status, conclusion) => (status === 'completed' ? conclusion || 'done' : status);
const statusCls = (status, conclusion) =>
  STATUS_STYLES[statusText(status, conclusion)] || 'bg-slate-400 text-white';

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

// SharePoint folder where the screenshot-diff baseline data is updated.
const DATA_URL =
  'https://adobe.sharepoint.com/sites/adobecom/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2Fadobecom%2FShared%20Documents%2Fmilo%2Fdrafts%2Fnala%2Fscreenshotdiff%2Fdata&viewid=d776cf70%2D9b7e%2D4ab7%2Db9da%2D9e0f8e03a7d2';

const RunConsolePage = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState('MILOCORE');
  const [config, setConfig] = useState(null);
  const [kind, setKind] = useState('screenshot'); // 'screenshot' | 'ios'
  const [site, setSite] = useState('bacom');
  const [milolibs, setMilolibs] = useState('?milolibs=stage');
  const [selDevices, setSelDevices] = useState(['iPhone 15']);
  const [selVersions, setSelVersions] = useState(['18.3']);
  const [run, setRun] = useState(null);
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    if (localStorage.getItem('theme') === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    fetch('/lab/config')
      .then((r) => r.json())
      .then((c) => {
        setConfig(c);
        if (c.sites?.length) setSite(c.sites[0]);
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
          iosVersions: ['18.3'],
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
  }, []);

  const refreshRuns = () => {
    fetch('/lab/runs').then((r) => r.json()).then(setRuns).catch(() => {});
  };

  const openStream = (runId) => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* noop */ }
    }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/lab/stream?runId=${runId}`);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.kind === 'update') {
        setRun(m);
        if (m.done) {
          setBusy(false);
          refreshRuns();
        }
      }
    };
    ws.onclose = () => setBusy(false);
    ws.onerror = () => setBusy(false);
  };

  const attachToRun = async (runId) => {
    try {
      const snap = await (await fetch(`/lab/runs/${runId}`)).json();
      setRun(snap);
      setBusy(!snap.done);
      if (!snap.done) openStream(runId);
    } catch { /* noop */ }
  };

  // On load, rediscover runs so a page refresh reconnects to an in-flight run.
  useEffect(() => {
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

  const toggleDevice = (d) =>
    setSelDevices((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const sessions = kind === 'ios' ? selDevices.length * selVersions.length : (config?.shards?.length || 3);
  const canRun = !busy && (kind !== 'ios' || (selVersions.length > 0 && selDevices.length > 0));

  const start = async () => {
    setBusy(true);
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch { /* noop */ }
    }
    const body =
      kind === 'ios'
        ? { kind, site, milolibs, iosVersions: selVersions, devices: selDevices }
        : { kind, site, milolibs };
    try {
      const res = await fetch('/lab/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
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
        site,
        milolibs,
        device,
        mode: data.mode,
        status: 'dispatching',
        jobs: [],
        conclusion: null,
        htmlUrl: null,
        resultsUrl: data.resultsUrl,
        done: false,
      });
      openStream(data.runId);
      refreshRuns();
    } catch (e) {
      setRun({ status: 'error', note: e.message || String(e), jobs: [] });
      setBusy(false);
    }
  };

  const isMock = config?.mode !== 'live';
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
              <button className={segBtn(kind === 'ios')} onClick={() => setKind('ios')}>
                Real iOS · Simulator
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className={`mb-1 block text-sm font-medium ${subtle}`}>Site</span>
                <select
                  className={`w-full rounded-lg border px-3 py-2 ${field}`}
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                >
                  {(config?.sites || []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
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

            {kind === 'screenshot' ? (
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
                    {(config?.iosDevices || ['iPhone 15']).map((d) => (
                      <button
                        key={d}
                        className={chip(selDevices.includes(d), false)}
                        onClick={() => toggleDevice(d)}
                      >
                        {d}
                      </button>
                    ))}
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
              </div>
            )}

            <div className="flex items-center justify-end gap-4 border-t pt-4" style={{ borderColor: isDarkMode ? '#1f2937' : '#e5e7eb' }}>
              <span className={`text-sm ${subtle}`}>
                {sessions} session{sessions === 1 ? '' : 's'}
              </span>
              <button
                className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white shadow transition hover:bg-indigo-700 disabled:opacity-50"
                onClick={start}
                disabled={!canRun}
              >
                {busy ? 'Running…' : '▶ Run'}
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
                    <span className={text}>{r.runKind === 'ios' ? `iOS · ${r.device}` : 'Viewport'}</span>
                    <span className={`${subtle} truncate`}>{r.site}</span>
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
                    {run.runKind === 'ios' ? `iOS · ${(run.devices || [run.device].filter(Boolean)).join(', ')}` : 'Viewport'} · {run.site} · {run.milolibs}
                  </span>
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
                    >
                      View Results ↗
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
