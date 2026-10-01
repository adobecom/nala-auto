import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Breadcrumb from '../components/Breadcrumb';
import Header from '../components/Header';

const REFRESH_MS = 60000;

const CHECKS = {
  passed: { label: 'Checks passing', chip: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  failed: { label: 'Checks failing', chip: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  pending: { label: 'Checks running', chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  none: { label: 'No checks', chip: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  unknown: { label: 'Checks unknown', chip: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
};

const STATE = {
  open: 'bg-green-600 text-white',
  merged: 'bg-purple-600 text-white',
  closed: 'bg-gray-500 text-white',
};

function ago(value, now) {
  if (!value) return '';
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.round(hours / 24)}d`;
}

const team = (label) => label.replace(/\s*SOT.*$/i, '').trim();

function ChecksChip({ checks }) {
  const style = CHECKS[checks?.overall] || CHECKS.unknown;
  const c = checks?.counts;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${style.chip}`} title={checks?.error}>
      {style.label}
      {c ? ` · ${c.passed}/${checks.total}` : ''}
    </span>
  );
}

ChecksChip.propTypes = {
  checks: PropTypes.shape({
    overall: PropTypes.string,
    total: PropTypes.number,
    error: PropTypes.string,
    counts: PropTypes.shape({ passed: PropTypes.number }),
  }),
};

function Signoffs({ signed, missing, isDarkMode }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {signed.map((label) => (
        <span key={label} className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
          ✓ {team(label)}
        </span>
      ))}
      {missing.map((label) => (
        <span
          key={label}
          className={`rounded-full border border-dashed px-2 py-0.5 text-xs ${isDarkMode ? 'border-gray-700 text-gray-400' : 'border-gray-300 text-gray-500'}`}
        >
          ○ {team(label)}
        </span>
      ))}
    </div>
  );
}

Signoffs.propTypes = {
  signed: PropTypes.arrayOf(PropTypes.string).isRequired,
  missing: PropTypes.arrayOf(PropTypes.string).isRequired,
  isDarkMode: PropTypes.bool.isRequired,
};

export default function ReleasesPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState('MILOCORE');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const response = await fetch(`/lab/releases${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setData(body);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      setNow(Date.now());
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem('theme') === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const handleThemeToggle = () => {
    setIsDarkMode((value) => {
      const next = !value;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  const page = isDarkMode ? 'bg-black' : 'bg-gray-50';
  const card = isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200';
  const text = isDarkMode ? 'text-gray-100' : 'text-gray-900';
  const subtle = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const divider = isDarkMode ? 'divide-gray-800' : 'divide-gray-100';

  const releases = data?.releases || [];
  const open = releases.filter((r) => r.state === 'open');
  const history = releases.filter((r) => r.state !== 'open');

  return (
    <div className={`${page} min-h-screen`}>
      <Header
        isDarkMode={isDarkMode}
        handleThemeToggle={handleThemeToggle}
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
      />
      <Breadcrumb items={[{ label: 'Milo releases' }]} isDarkMode={isDarkMode} activeMenu={activeMenu} />

      <main className={`container mx-auto max-w-5xl space-y-6 p-4 ${text}`}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Milo releases</h1>
            <p className={`text-sm ${subtle}`}>
              &ldquo;{data?.title || '[Release] Stage to Main'}&rdquo; PRs
              {data?.owner ? ` in ${data.owner}/${data.repo}` : ''}
              {data?.updatedAt ? ` · updated ${ago(data.updatedAt, now)} ago` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => refresh(true)}
            disabled={loading}
            className={`rounded-lg border px-3 py-1.5 text-sm ${card} hover:opacity-80 disabled:opacity-50`}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {!data && !error && <p className={subtle}>Loading release PRs…</p>}

        {data && open.length === 0 && (
          <div className={`rounded-xl border p-4 text-sm shadow-sm ${card}`}>
            No open release PR right now. The last one is listed below.
          </div>
        )}

        {open.map((r) => (
          <section key={r.number} className={`space-y-4 rounded-xl border p-4 shadow-sm ${card}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <a href={r.url} target="_blank" rel="noreferrer" className="text-lg font-semibold hover:underline">
                  #{r.number} {r.title}
                </a>
                <div className={`mt-1 text-sm ${subtle}`}>
                  {r.head} → {r.base} · opened {ago(r.createdAt, now)} ago ·{' '}
                  <span className="text-green-600 dark:text-green-400">+{r.additions}</span>{' '}
                  <span className="text-red-600 dark:text-red-400">−{r.deletions}</span> in {r.changedFiles} files
                  {r.mergeableState && r.mergeableState !== 'unknown' ? ` · mergeable: ${r.mergeableState}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATE.open}`}>{r.draft ? 'Draft' : 'Open'}</span>
                <ChecksChip checks={r.checks} />
              </div>
            </div>

            <div>
              <h3 className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${subtle}`}>
                Team sign-off ({r.signed.length}/{r.signed.length + r.missing.length})
              </h3>
              <Signoffs signed={r.signed} missing={r.missing} isDarkMode={isDarkMode} />
            </div>

            {(r.checks?.failed?.length > 0 || r.checks?.pending?.length > 0) && (
              <div>
                <h3 className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${subtle}`}>Checks needing attention</h3>
                <ul className="space-y-0.5 text-sm">
                  {[...r.checks.failed, ...r.checks.pending].map((check) => (
                    <li key={check.name}>
                      <a href={check.url} target="_blank" rel="noreferrer" className="hover:underline">
                        <span className={r.checks.failed.includes(check) ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}>
                          {r.checks.failed.includes(check) ? '✕' : '…'} {check.state}
                        </span>{' '}
                        {check.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${subtle}`}>
                Included PRs ({r.includedCount})
              </h3>
              <ul className={`divide-y ${divider} text-sm`}>
                {r.included.map((pr) => (
                  <li key={pr.number} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                    <a href={pr.url} target="_blank" rel="noreferrer" className="hover:underline">
                      <span className={subtle}>#{pr.number}</span> {pr.title || ''}
                    </a>
                    {pr.author && <span className={`text-xs ${subtle}`}>{pr.author}</span>}
                  </li>
                ))}
                {r.includedCount > r.included.length && (
                  <li className={`py-1.5 text-xs ${subtle}`}>
                    +{r.includedCount - r.included.length} more on GitHub
                  </li>
                )}
              </ul>
            </div>
          </section>
        ))}

        {history.length > 0 && (
          <section className={`overflow-hidden rounded-xl border shadow-sm ${card}`}>
            <h2 className="border-b px-4 py-3 font-semibold dark:border-gray-800">Recent releases</h2>
            <ul className={`divide-y ${divider} text-sm`}>
              {history.map((r) => (
                <li key={r.number} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-1.5">
                    <a href={r.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                      #{r.number}
                    </a>
                    <span className={subtle}>
                      {' '}· {r.includedCount} PRs · +{r.additions} −{r.deletions} ·{' '}
                      {r.state === 'merged' ? `merged ${ago(r.mergedAt, now)} ago` : `closed ${ago(r.closedAt, now)} ago`}
                    </span>
                    <Signoffs signed={r.signed} missing={r.missing} isDarkMode={isDarkMode} />
                  </div>
                  <div className="flex items-start gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATE[r.state] || STATE.closed}`}>
                      {r.state === 'merged' ? 'Merged' : 'Closed'}
                    </span>
                    <ChecksChip checks={r.checks} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
