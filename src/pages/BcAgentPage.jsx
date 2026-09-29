import { useCallback, useEffect, useMemo, useState } from 'react';
import Breadcrumb from '../components/Breadcrumb';
import Header from '../components/Header';

const DEFAULT_URL = 'https://business.stage.adobe.com/?milolibs=stage';
const reportBase = (runId) => `/api/milo/screenshots/bc-agent/runs/${encodeURIComponent(runId)}`;

const WORKFLOW_CHECKS = [
  {
    id: 'recommendation',
    title: 'Product recommendations',
    detail: 'Checks that Brand Concierge recommends relevant Adobe products and renders product links or cards.',
  },
  {
    id: 'citations',
    title: 'Sources and citations',
    detail: 'Checks that factual answers include sources and citation links.',
  },
  {
    id: 'comparison',
    title: 'Product comparisons',
    detail: 'Checks that comparison requests render a structured product comparison table.',
  },
  {
    id: 'sales',
    title: 'Sales and meeting flow',
    detail: 'Checks that sales intent reaches Schedule meeting and the contact form.',
  },
  {
    id: 'generation',
    title: 'Image generation and quota',
    detail: 'Checks image generation, or Firefly Gallery and Sign in after the two free generations are used.',
  },
  {
    id: 'feedback',
    title: 'Response feedback',
    detail: 'Checks that assistant responses expose feedback controls.',
  },
];

const tone = (value, dark) => {
  if (value === 'success') return dark ? 'bg-emerald-950 text-emerald-300' : 'bg-emerald-100 text-emerald-800';
  if (value === 'failure' || value === 'error') return dark ? 'bg-rose-950 text-rose-300' : 'bg-rose-100 text-rose-800';
  if (value === 'in_progress') return dark ? 'bg-blue-950 text-blue-300' : 'bg-blue-100 text-blue-800';
  return dark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700';
};

const validHttpUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const BcAgentPage = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState('MILOCORE');
  const [url, setUrl] = useState(DEFAULT_URL);
  const [runs, setRuns] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [publishedRuns, setPublishedRuns] = useState([]);
  const [reportIndexError, setReportIndexError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/lab/runs');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Run service is unavailable.');
      setRuns(data.filter((run) => run.runKind === 'bc'));
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadReports = async () => {
      try {
        const response = await fetch('/api/milo/screenshots/bc-agent/runs/index.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Report index unavailable (${response.status}).`);
        const entries = await response.json();
        if (!Array.isArray(entries)) throw new Error('Invalid report index.');
        if (!cancelled) setPublishedRuns(entries.map((entry) => entry.runId));
      } catch (requestError) {
        if (!cancelled) setReportIndexError(requestError.message);
      }
    };
    loadReports();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (localStorage.getItem('theme') === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    refresh();
  }, [refresh]);

  const current = useMemo(
    () => runs.find((run) => run.runId === currentId)
      || runs.find((run) => !run.done)
      || runs[0],
    [currentId, runs],
  );

  useEffect(() => {
    setSummary(null);
    if (!current?.runId || !current.done) return undefined;
    let cancelled = false;
    let attempts = 0;
    let timer;
    const load = async () => {
      attempts += 1;
      const base = reportBase(current.runId);
      try {
        const response = await fetch(`${base}/workflow-summary.json`, { cache: 'no-store' });
        if (!response.ok) throw new Error('not published');
        const data = await response.json();
        if (!cancelled) setSummary({ ...data, base });
      } catch {
        // S3 publication can trail workflow completion briefly; the GitHub run
        // remains the fallback while the report becomes available.
        if (!cancelled && attempts < 10) timer = window.setTimeout(load, 3000);
      }
    };
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [current?.runId, current?.done]);

  useEffect(() => {
    if (!current?.runId || current.done) return undefined;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/lab/stream?runId=${current.runId}`);
    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      setRuns((items) => {
        const found = items.some((item) => item.runId === update.runId);
        return found
          ? items.map((item) => (item.runId === update.runId ? update : item))
          : [update, ...items];
      });
    };
    ws.onerror = () => refresh();
    return () => ws.close();
  }, [current?.runId, current?.done, refresh]);

  const handleThemeToggle = () => {
    setIsDarkMode((value) => {
      const next = !value;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/lab/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'bc', url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not dispatch the workflow.');
      setCurrentId(data.runId);
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const page = isDarkMode ? 'bg-black' : 'bg-gray-50';
  const card = isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200';
  const text = isDarkMode ? 'text-gray-100' : 'text-gray-900';
  const subtle = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const field = isDarkMode
    ? 'bg-gray-800 border-gray-700 text-gray-100'
    : 'bg-white border-gray-300 text-gray-900';
  const running = current && !current.done;

  return (
    <div className={`${page} min-h-screen`}>
      <Header
        isDarkMode={isDarkMode}
        handleThemeToggle={handleThemeToggle}
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
      />
      <Breadcrumb items={[{ label: 'Brand Concierge workflow' }]} isDarkMode={isDarkMode} activeMenu={activeMenu} />

      <main className="container mx-auto max-w-5xl space-y-6 p-4">
        <div>
          <h1 className={`text-2xl font-bold ${text}`}>Brand Concierge workflow</h1>
          <p className={`mt-1 ${subtle}`}>
            Dispatches the standard conversation health check to the same self-hosted Mac mini pool as Screenshot Diff.
          </p>
        </div>

        {error && <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

        <section className={`rounded-xl border shadow-sm ${card}`}>
          <div className="p-5">
            <h2 className={`font-semibold ${text}`}>What this workflow checks</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {WORKFLOW_CHECKS.map((check) => {
                const result = summary?.checks?.find((item) => item.id === check.id);
                const passed = result?.pass === true;
                const reviewed = result?.pass === false;
                const badge = passed
                  ? 'bg-emerald-500 text-white'
                  : reviewed
                    ? 'bg-amber-500 text-white'
                    : isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-500';
                return (
                <div key={check.title} className={`rounded-lg p-3 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${badge}`} aria-hidden="true">
                      {passed ? '✓' : reviewed ? '!' : '•'}
                    </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`text-sm font-semibold ${text}`}>{check.title}</h3>
                      {result && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {passed ? 'PASS' : 'REVIEW'}
                        </span>
                      )}
                    </div>
                    <p className={`mt-0.5 text-sm leading-5 ${subtle}`}>{check.detail}</p>
                  </div>
                  </div>
                  {result?.screenshot && (
                    <a
                      href={`${summary.base}/${encodeURIComponent(result.screenshot)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 block"
                    >
                      <img
                        src={`${summary.base}/${encodeURIComponent(result.screenshot)}`}
                        alt={`${check.title} evidence`}
                        className="h-36 w-full rounded-lg border border-gray-200 object-cover object-top dark:border-gray-700"
                        loading="lazy"
                      />
                      <span className="mt-1 block text-xs font-medium text-indigo-600">View screenshot in new tab ↗</span>
                    </a>
                  )}
                </div>
                );
              })}
            </div>
            {current?.done && !summary && (
              <p className={`mt-4 text-xs ${subtle}`}>Publishing check status and screenshots…</p>
            )}
          </div>
        </section>

        <section className={`rounded-xl border shadow-sm ${card}`}>
          <div className="space-y-4 p-5">
            <label className="block">
              <span className={`mb-1 block text-sm font-medium ${subtle}`}>Page containing Brand Concierge</span>
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className={`w-full rounded-lg border px-3 py-2 ${field}`}
                placeholder="https://business.stage.adobe.com/?milolibs=stage"
              />
            </label>
            <div className={`rounded-lg px-4 py-3 text-sm ${isDarkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}`}>
              Current accepted behavior: Firefly photo recommendations; sales may go directly to Schedule meeting;
              after two free generations, Firefly Gallery + Sign in is valid. A run takes about 2–4 minutes.
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className={`text-xs ${subtle}`}>
                GitHub workflow → self-hosted macOS runner → report artifact (7-day retention)
              </span>
              <button
                onClick={start}
                disabled={busy || !validHttpUrl(url)}
                className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white shadow transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? 'Dispatching…' : '▶ Run workflow'}
              </button>
            </div>
          </div>
        </section>

        {current && (
          <section className={`rounded-xl border shadow-sm ${card}`}>
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className={`font-semibold ${text}`}>
                    {running ? 'Active run' : 'Latest run'}{' '}
                    <span className={`font-mono text-xs ${subtle}`}>{current.runId}</span>
                  </h2>
                  <p className={`mt-1 break-all text-sm ${subtle}`}>{current.urls?.[0]}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone(current.conclusion || current.status, isDarkMode)}`}>
                    {summary ? `${summary.status.toUpperCase()} ${summary.passed}/${summary.total}` : current.conclusion || current.status}
                  </span>
                  {summary && (
                    <a
                      href={`${summary.base}/report.html`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-indigo-600 hover:underline"
                    >
                      View full report in new tab ↗
                    </a>
                  )}
                  {current.htmlUrl && (
                    <a href={current.htmlUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-indigo-600 hover:underline">
                      GitHub run ↗
                    </a>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {(current.jobs || []).map((job) => (
                  <div key={job.name} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                    <span className={text}>{job.name}</span>
                    <span className={`rounded px-2 py-0.5 text-xs ${tone(job.conclusion || job.status, isDarkMode)}`}>
                      {job.conclusion || job.status}
                    </span>
                  </div>
                ))}
                {!current.jobs?.length && <p className={`text-sm ${subtle}`}>{current.note || 'Locating the GitHub Actions run…'}</p>}
              </div>
              {current.done && (
                <p className={`text-xs ${subtle}`}>
                  The workflow uploads <code>workflow-summary.md</code>, JSON, the full HTML report and screenshots
                  as artifact <code>bc-agent-{current.runId}</code>.
                </p>
              )}
            </div>
          </section>
        )}

        <section className={`rounded-xl border shadow-sm ${card}`}>
          <div className="p-5">
            <h2 className={`mb-3 font-semibold ${text}`}>Recent runs</h2>
            {!runs.length && <p className={`text-sm ${subtle}`}>No Brand Concierge workflow runs yet.</p>}
            {reportIndexError && <p className="text-sm text-rose-600">{reportIndexError} Published report links may be unavailable.</p>}
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {runs.map((run) => (
                <li key={run.runId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <button type="button" onClick={() => setCurrentId(run.runId)} className="min-w-0 text-left">
                    <span className="font-mono font-semibold text-indigo-600">{run.runId}</span>
                    <span className={`ml-2 break-all ${subtle}`}>{run.urls?.[0]}</span>
                  </button>
                  <div className="flex items-center gap-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${tone(run.conclusion || run.status, isDarkMode)}`}>
                      {run.conclusion || run.status}
                    </span>
                    {(publishedRuns.includes(run.runId) || (summary?.runId === run.runId && summary?.base)) && (
                      <a href={`${reportBase(run.runId)}/report.html`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                        View results ↗
                      </a>
                    )}
                    {run.htmlUrl && (
                      <a href={run.htmlUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                        GitHub run ↗
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
};

export default BcAgentPage;
