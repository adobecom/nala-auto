import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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

// Repos without SOT labels: show the PR's own labels (e.g. "verified", "QA Approved").
function Labels({ labels, isDarkMode }) {
  if (!labels?.length) return <span className="text-xs opacity-60">No labels</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <span key={label} className={`rounded-full px-2 py-0.5 text-xs ${isDarkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
          {label}
        </span>
      ))}
    </div>
  );
}

Labels.propTypes = {
  labels: PropTypes.arrayOf(PropTypes.string),
  isDarkMode: PropTypes.bool.isRequired,
};

function Status({ release, isDarkMode }) {
  if (release.signed.length + release.missing.length === 0) {
    return <Labels labels={release.labels} isDarkMode={isDarkMode} />;
  }
  return <Signoffs signed={release.signed} missing={release.missing} isDarkMode={isDarkMode} />;
}

Status.propTypes = {
  release: PropTypes.shape({
    signed: PropTypes.arrayOf(PropTypes.string),
    missing: PropTypes.arrayOf(PropTypes.string),
    labels: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
  isDarkMode: PropTypes.bool.isRequired,
};

Signoffs.propTypes = {
  signed: PropTypes.arrayOf(PropTypes.string).isRequired,
  missing: PropTypes.arrayOf(PropTypes.string).isRequired,
  isDarkMode: PropTypes.bool.isRequired,
};

// Datasets mapped to a repo + one-click live visual diff of all of them.
function VisualDiffPanel({ repo, datasets, onSaved, card, subtle }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setResult(null);
    setEditing(false);
  }, [repo]);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/lab/repo-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo }),
      });
      const body = await res.json().catch(() => ({}));
      setResult(res.ok || res.status === 409 ? body : { runs: [], errors: [{ site: '', error: body.error || `HTTP ${res.status}` }] });
    } catch (e) {
      setResult({ runs: [], errors: [{ site: '', error: String(e.message || e) }] });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const list = draft.split(/[\s,]+/).map((d) => d.trim()).filter(Boolean);
    const res = await fetch('/lab/repo-datasets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, datasets: list }),
    });
    if (res.ok) {
      setEditing(false);
      onSaved();
    }
  };

  return (
    <section className={`space-y-2 rounded-xl border p-4 text-sm shadow-sm ${card}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">Visual diff</span>
          {datasets.length ? datasets.map((d) => (
            <a
              key={d}
              href={`/console?site=${encodeURIComponent(d)}`}
              className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 hover:underline dark:bg-indigo-900/40 dark:text-indigo-300"
            >
              {d}
            </a>
          )) : <span className={subtle}>no datasets mapped to {repo}</span>}
          <button
            type="button"
            className={`text-xs ${subtle} hover:underline`}
            onClick={() => { setDraft(datasets.join(', ')); setEditing((v) => !v); }}
          >
            {editing ? 'cancel' : 'edit'}
          </button>
        </div>
        <button
          type="button"
          disabled={busy || !datasets.length}
          onClick={run}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          title="Screenshot every mapped dataset (live) and compare against its baseline"
        >
          {busy ? 'Starting…' : 'Run visual diff'}
        </button>
      </div>
      {editing && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="dataset names, comma separated (e.g. milo, bacom)"
            className="min-w-[16rem] flex-1 rounded border px-2 py-1 text-sm text-gray-900"
          />
          <button type="button" onClick={save} className="rounded border px-2 py-1 text-sm hover:opacity-80">Save</button>
        </div>
      )}
      {result && (
        <ul className="space-y-0.5">
          {result.runs?.map((r) => (
            <li key={r.runId}>
              ✓ {r.site} started ·{' '}
              <a className="text-indigo-600 hover:underline dark:text-indigo-400" href={`/console?site=${encodeURIComponent(r.site)}`}>console</a>
            </li>
          ))}
          {result.errors?.map((e) => (
            <li key={e.site || e.error} className="text-red-600 dark:text-red-400">✕ {e.site ? `${e.site}: ` : ''}{e.error}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

VisualDiffPanel.propTypes = {
  repo: PropTypes.string.isRequired,
  datasets: PropTypes.arrayOf(PropTypes.string).isRequired,
  onSaved: PropTypes.func.isRequired,
  card: PropTypes.string.isRequired,
  subtle: PropTypes.string.isRequired,
};

export default function ReleasesPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState('MILOCORE');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [repos, setRepos] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const repo = searchParams.get('repo') || repos[0]?.id || '';

  const loadRepos = useCallback(() => {
    fetch('/lab/releases/repos', { cache: 'no-store' })
      .then((r) => r.json())
      .then((body) => setRepos(body.repos || []))
      .catch(() => setRepos([]));
  }, []);
  useEffect(loadRepos, [loadRepos]);
  const repoDatasets = repos.find((r) => r.id === repo)?.datasets || [];

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (repo) params.set('repo', repo);
      if (force) params.set('refresh', '1');
      const response = await fetch(`/lab/releases?${params}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      if (repo && `${body.owner}/${body.repo}`.toLowerCase() !== repo.toLowerCase()) return;
      setData(body);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      setNow(Date.now());
    }
  }, [repo]);

  useEffect(() => {
    setData(null);
    setError('');
  }, [repo]);

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
      <Breadcrumb items={[{ label: 'Releases' }]} isDarkMode={isDarkMode} activeMenu={activeMenu} />

      <main className={`container mx-auto max-w-5xl space-y-6 p-4 ${text}`}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Releases</h1>
            <p className={`text-sm ${subtle}`}>
              {data?.head || 'stage'} → {data?.base || 'main'} PRs
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

        {repos.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {repos.map((r) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={r.id === repo}
                title={r.id}
                onClick={() => setSearchParams({ repo: r.id })}
                className={`rounded-full border px-3 py-1 text-sm ${r.id === repo
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : `${card} hover:opacity-80`}`}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}

        {repo && (
          <VisualDiffPanel repo={repo} datasets={repoDatasets} onSaved={loadRepos} card={card} subtle={subtle} />
        )}

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
                {r.signed.length + r.missing.length
                  ? `Team sign-off (${r.signed.length}/${r.signed.length + r.missing.length})`
                  : 'Labels'}
              </h3>
              <Status release={r} isDarkMode={isDarkMode} />
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
                    <Status release={r} isDarkMode={isDarkMode} />
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
