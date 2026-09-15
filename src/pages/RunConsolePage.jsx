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

const RunConsolePage = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState('MILOCORE');
  const [config, setConfig] = useState(null);
  const [kind, setKind] = useState('screenshot'); // 'screenshot' | 'ios'
  const [site, setSite] = useState('bacom');
  const [milolibs, setMilolibs] = useState('?milolibs=stage');
  const [device, setDevice] = useState('iPhone 15');
  const [selVersions, setSelVersions] = useState(['17.5', '18.0']);
  const [run, setRun] = useState(null);
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
        if (c.iosDevices?.length) setDevice(c.iosDevices[0]);
        if (c.iosVersions?.length) setSelVersions(c.iosVersions.slice(1));
      })
      .catch(() =>
        setConfig({
          mode: 'mock',
          sites: ['bacom'],
          shards: ['chrome', 'ipad', 'iphone'],
          iosDevices: ['iPhone 15'],
          iosVersions: ['16.4', '17.5', '18.0'],
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

  const sessions = kind === 'ios' ? selVersions.length : (config?.shards?.length || 3);
  const canRun = !busy && (kind !== 'ios' || selVersions.length > 0);

  const start = async () => {
    setBusy(true);
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch { /* noop */ }
    }
    const body =
      kind === 'ios'
        ? { kind, site, milolibs, iosVersions: selVersions, device }
        : { kind, site, milolibs };
    try {
      const res = await fetch('/lab/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
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
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/lab/stream?runId=${data.runId}`);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.kind === 'update') {
          setRun(m);
          if (m.done) setBusy(false);
        }
      };
      ws.onclose = () => setBusy(false);
      ws.onerror = () => setBusy(false);
    } catch (e) {
      setRun({ status: 'error', note: String(e), jobs: [] });
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
                <label className="block max-w-xs">
                  <span className={`mb-1 block text-sm font-medium ${subtle}`}>Simulator device</span>
                  <select
                    className={`w-full rounded-lg border px-3 py-2 ${field}`}
                    value={device}
                    onChange={(e) => setDevice(e.target.value)}
                  >
                    {(config?.iosDevices || ['iPhone 15']).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <div className={`mb-2 text-sm font-medium ${subtle}`}>
                    iOS versions — real Mobile Safari via Appium + Simulator (pick any)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(config?.iosVersions || ['16.4', '17.5', '18.0']).map((v) => (
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

        {/* Live run panel */}
        {run && (
          <div className={`rounded-xl border shadow-sm ${card}`}>
            <div className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className={`text-lg font-semibold ${text}`}>Run {run.runId ? `#${run.runId}` : ''}</h2>
                  {renderPill(run.status, run.conclusion)}
                  <span className={`text-sm ${subtle}`}>
                    {run.runKind === 'ios' ? `iOS · ${run.device}` : 'Viewport'} · {run.site} · {run.milolibs}
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
