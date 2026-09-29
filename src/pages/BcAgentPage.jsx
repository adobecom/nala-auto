import { useCallback, useEffect, useMemo, useState } from 'react';
import Breadcrumb from '../components/Breadcrumb';
import Header from '../components/Header';

const DEFAULT_URL = 'https://business.stage.adobe.com/?milolibs=stage';

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
            The runner explores recommendations, citations, comparisons, image-generation quota behavior and meeting flows.
          </p>
        </div>

        {error && <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

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
                    {current.conclusion || current.status}
                  </span>
                  {current.htmlUrl && (
                    <a href={current.htmlUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-indigo-600 hover:underline">
                      Open workflow &amp; report artifact ↗
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
                    {run.htmlUrl && (
                      <a href={run.htmlUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">GitHub ↗</a>
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
