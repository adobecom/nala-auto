import { useCallback, useEffect, useMemo, useState } from 'react';
import Breadcrumb from '../components/Breadcrumb';
import Header from '../components/Header';

const DEFAULT_URL = 'https://business.stage.adobe.com/?milolibs=stage';
const reportBase = (runId) => `/api/milo/screenshots/bc-agent/runs/${encodeURIComponent(runId)}`;

// Mirrors tools/bc-agent/lib/monitor.js in Milo (suite "monitor").
const MONITOR_CHECKS = [
  { id: 'paa-product', group: 'Product Advisor', title: 'Product knowledge', detail: 'Product questions answer with a product card, cited sources or product links.' },
  { id: 'paa-compare', group: 'Product Advisor', title: 'Product comparison', detail: 'Comparison questions render a structured comparison table.' },
  { id: 'pricing', group: 'Product Advisor', title: 'Pricing', detail: 'Pricing questions show a price or link to the plans / pricing page.' },
  { id: 'acrobat-cta', group: 'Product Advisor', title: 'Acrobat frictionless CTA', detail: 'Acrobat task prompts show a product card whose button opens the matching Acrobat online tool.' },
  { id: 'genie', group: 'Genie', title: 'How-to help', detail: 'How-to questions answer with Help / Experience League sources or the right download page.' },
  { id: 'firefly-generate', group: 'Firefly', title: 'Image generation', detail: 'Image prompts generate an image, or show Firefly Gallery + Sign in once free generations are used.' },
  { id: 'firefly-boards', group: 'Firefly', title: 'Boards discovery', detail: 'Mood board / storyboard intents point to Firefly Boards.' },
  { id: 'firefly-edit', group: 'Firefly', title: 'Image edit discovery', detail: 'Photo edit intents point to the Firefly image editor.' },
  { id: 'bam-explicit', group: 'Book a Meeting', title: 'Explicit sales request', detail: 'A direct sales request offers Schedule meeting and opens the meeting form.' },
  { id: 'bam-implicit', group: 'Book a Meeting', title: 'Implicit sales signal', detail: 'Enterprise pricing / demo questions offer a path to sales.' },
  { id: 'bam-clarify', group: 'Book a Meeting', title: 'Ambiguous request clarifies', detail: 'A vague "talk to someone" asks which product first, then offers the meeting.' },
  { id: 'live-chat', group: 'Live Agent', title: 'Live advisor handoff', detail: 'On business.adobe.com, buying at scale connects to a live advisor (the monitor ends the connection).' },
  { id: 'support-deflect', group: 'Live Agent', title: 'Support requests deflect', detail: 'Billing / account / install problems point to support, not a sales advisor.' },
  { id: 'out-of-scope', group: 'Guardrails', title: 'Out of scope / jailbreak', detail: 'Off-topic and prompt-injection requests are declined without product widgets.' },
  { id: 'feedback', group: 'Chat UI', title: 'Response feedback', detail: 'Assistant replies expose thumbs up / down controls.' },
];

// Runs published before the monitor suite (suite "explore").
const LEGACY_CHECKS = [
  { id: 'recommendation', group: 'Standard workflow', title: 'Product recommendations', detail: 'Recommends relevant Adobe products and renders product links or cards.' },
  { id: 'citations', group: 'Standard workflow', title: 'Sources and citations', detail: 'Factual answers include sources and citation links.' },
  { id: 'comparison', group: 'Standard workflow', title: 'Product comparisons', detail: 'Comparison requests render a structured product comparison table.' },
  { id: 'sales', group: 'Standard workflow', title: 'Sales and meeting flow', detail: 'Sales intent reaches Schedule meeting and the contact form.' },
  { id: 'generation', group: 'Standard workflow', title: 'Image generation and quota', detail: 'Image generation, or Firefly Gallery and Sign in after the free generations.' },
  { id: 'feedback', group: 'Standard workflow', title: 'Response feedback', detail: 'Assistant responses expose feedback controls.' },
];

const STATUS_STYLE = {
  pass: { icon: '✓', dot: 'bg-emerald-500 text-white', pill: 'bg-emerald-100 text-emerald-800', label: 'PASS' },
  review: { icon: '!', dot: 'bg-amber-500 text-white', pill: 'bg-amber-100 text-amber-800', label: 'REVIEW' },
  error: { icon: '×', dot: 'bg-rose-500 text-white', pill: 'bg-rose-100 text-rose-800', label: 'ERROR' },
  skip: { icon: '–', dot: 'bg-gray-400 text-white', pill: 'bg-gray-100 text-gray-600', label: 'SKIPPED' },
};

const statusOf = (result) => {
  if (!result) return null;
  if (result.status && STATUS_STYLE[result.status]) return result.status;
  return result.pass ? 'pass' : 'review';
};

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
  const checkList = summary && summary.suite !== 'monitor' ? LEGACY_CHECKS : MONITOR_CHECKS;
  const checkGroups = [...checkList.reduce((map, check) => map.set(check.group, [...(map.get(check.group) || []), check]), new Map())];

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
            Monitors every Brand Concierge agent on the same self-hosted Mac mini pool as Screenshot Diff.
          </p>
        </div>

        {error && <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

        <section className={`rounded-xl border shadow-sm ${card}`}>
          <div className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className={`font-semibold ${text}`}>What the monitor checks</h2>
              {summary && (
                <span className={`text-xs ${subtle}`}>
                  {summary.passed}/{summary.total} passed
                  {summary.skipped ? ` · ${summary.skipped} skipped` : ''}
                  {summary.poolSource ? ` · prompt pool: ${summary.poolSource}` : ''}
                </span>
              )}
            </div>
            <p className={`mt-1 text-sm ${subtle}`}>
              One short conversation per Brand Concierge agent, judged on routing and rendered widgets, not wording.
              Prompts rotate through a private pool curated from the M2 golden set; a miss is retried once.
            </p>
            {summary?.poolSource === 'example' && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                This run used the public example prompts. Set the <code>BC_MONITOR_POOL</code> secret on the Milo repository to rotate through the real pool.
              </div>
            )}
            <div className="mt-4 space-y-5">
              {checkGroups.map(([group, checks]) => (
                <div key={group}>
                  <h3 className={`mb-2 text-xs font-semibold uppercase tracking-wide ${subtle}`}>{group}</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {checks.map((check) => {
                      const result = summary?.checks?.find((item) => item.id === check.id);
                      const status = statusOf(result);
                      const style = STATUS_STYLE[status];
                      const shot = result?.screenshot ? `${summary.base}/${encodeURIComponent(result.screenshot)}` : null;
                      return (
                        <div key={check.id} className={`rounded-lg p-3 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                          <div className="flex items-start gap-3">
                            <span
                              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${style ? style.dot : isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-500'}`}
                              aria-hidden="true"
                            >
                              {style ? style.icon : '•'}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className={`text-sm font-semibold ${text}`}>{check.title}</h4>
                                {style && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style.pill}`}>{style.label}</span>}
                                {result?.flaky && (
                                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold text-yellow-800" title="Passed on the retry">FLAKY</span>
                                )}
                              </div>
                              <p className={`mt-0.5 text-sm leading-5 ${subtle}`}>{check.detail}</p>
                              {result?.observed && (
                                <p className={`mt-1 text-xs font-medium ${status === 'pass' ? 'text-emerald-600' : status === 'skip' ? subtle : 'text-amber-600'}`}>
                                  Observed: {result.observed}
                                </p>
                              )}
                              {result?.prompt && (
                                <p className={`mt-1 truncate text-xs italic ${subtle}`} title={result.prompt}>
                                  Prompt: “{result.prompt}”
                                </p>
                              )}
                            </div>
                          </div>
                          {shot && (
                            <a href={shot} target="_blank" rel="noopener noreferrer" className="mt-3 block">
                              <img
                                src={shot}
                                alt={`${check.title} evidence`}
                                className={`h-72 w-full rounded-lg border object-contain ${isDarkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}
                                loading="lazy"
                              />
                              <span className="mt-1 block text-xs font-medium text-indigo-600">View screenshot in new tab ↗</span>
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
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
              Accepted behavior: sales may go directly to Schedule meeting; after the free generations, Firefly Gallery + Sign in
              is valid; Live Agent is only expected on business.adobe.com (skipped elsewhere). A run takes about 5 minutes.
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className={`text-xs ${subtle}`}>
                GitHub workflow → self-hosted macOS runner → internal S3 report
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
                  The full report, transcripts and screenshots are published to internal S3 only; the public GitHub run
                  shows check ids and statuses, never prompts.
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
