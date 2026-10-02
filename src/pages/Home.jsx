import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import Header from '../components/Header';
import {
  fetchCustomDatasets,
  addCustomDataset,
  removeCustomDataset,
  CUSTOM_DATASETS_EVENT,
} from '../lib/customDatasets';
import { useSiteGroups } from '../lib/useSiteGroups';
import {
  resultsHref,
  runState,
  styleFor,
  timeAgo,
  useBcSummary,
  useLabRuns,
} from '../lib/labRuns';

const DATA_URL = 'https://adobe.sharepoint.com/sites/adobecom/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2Fadobecom%2FShared%20Documents%2Fmilo%2Fdrafts%2Fnala%2Fscreenshotdiff%2Fdata&viewid=d776cf70%2D9b7e%2D4ab7%2Db9da%2D9e0f8e03a7d2';

const GRADIENTS = [
  'from-indigo-500 to-sky-500',
  'from-violet-500 to-fuchsia-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-cyan-500 to-blue-500',
];
const gradientFor = (s) => GRADIENTS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];
const initials = (s) => s.slice(0, 2).toUpperCase();

const QUICK_START = [
  { to: '/console?mode=quick', icon: '⚡', title: 'Quick run', detail: 'Paste a few URLs and diff them — no dataset needed.' },
  { to: '/console?mode=figma', icon: '🎨', title: 'Figma compare', detail: 'Diff a live page region against its Figma frame.' },
  { to: '/bc-agent', icon: '💬', title: 'BC workflow', detail: 'Health-check Brand Concierge conversations on any URL.' },
  { to: '/manual-ios', icon: '📱', title: 'Manual iOS Safari', detail: 'Drive a real iOS Simulator from the browser.' },
];

const KIND_LABEL = {
  bc: 'BC workflow',
  screenshot: 'Screenshot diff',
  quick: 'Quick run',
  figma: 'Figma compare',
  ios: 'iOS',
};

const StatusPill = ({ state }) => {
  const style = styleFor(state);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />
      {style.label}
    </span>
  );
};

StatusPill.propTypes = { state: PropTypes.string };

const HomePage = () => {
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [group, setGroup] = useState(() => localStorage.getItem('homeGroup') || 'ALL');
  const [filter, setFilter] = useState('');
  const [customDatasets, setCustomDatasets] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [missingSheet, setMissingSheet] = useState(null);
  const siteGroups = useSiteGroups();
  const { runs, loaded, error: runsError } = useLabRuns();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('homeGroup', group);
  }, [group]);

  // Custom datasets are persisted server-side (shared across everyone).
  useEffect(() => {
    const refresh = () => fetchCustomDatasets().then(setCustomDatasets);
    refresh();
    window.addEventListener(CUSTOM_DATASETS_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(CUSTOM_DATASETS_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // Server groups (shared with header/sidebar/console); CUSTOM stays as a tab
  // even when empty so "+ Add dataset" has somewhere to land.
  const groups = useMemo(
    () => ({ ...siteGroups, CUSTOM: siteGroups.CUSTOM || customDatasets.filter((s) => !Object.values(siteGroups).flat().includes(s)) }),
    [siteGroups, customDatasets],
  );

  const lastRunBySite = useMemo(() => {
    const map = {};
    runs.forEach((run) => {
      if (run.runKind !== 'bc' && run.site && !map[run.site]) map[run.site] = run;
    });
    return map;
  }, [runs]);

  const latestDiff = runs.find((run) => run.runKind !== 'bc');
  const latestBc = runs.find((run) => run.runKind === 'bc');
  const bcSummary = useBcSummary(latestBc);
  const running = runs.filter((run) => !run.done);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const today = runs.filter((run) => run.startedAt > dayAgo);
  const finished = runs.filter((run) => run.done).slice(0, 10);
  const passRate = finished.length
    ? Math.round((finished.filter((run) => run.conclusion === 'success').length / finished.length) * 100)
    : null;

  const sites = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const entries = group === 'ALL'
      ? Object.entries(groups).flatMap(([name, items]) => items.map((site) => ({ site, group: name })))
      : (groups[group] || []).map((site) => ({ site, group }));
    return q ? entries.filter(({ site }) => site.includes(q)) : entries;
  }, [filter, group, groups]);

  const addDataset = async (force) => {
    setAdding(true);
    const { name, error, dataset } = await addCustomDataset(newDatasetName, { force });
    setAdding(false);
    if (!name) {
      setAddError(error);
      setMissingSheet(dataset && !dataset.exists ? dataset : null);
      return;
    }
    setMissingSheet(null);
    setCustomDatasets(await fetchCustomDatasets());
    setNewDatasetName('');
    setAddError('');
    setShowAddForm(false);
    setGroup('CUSTOM');
  };

  const handleAddDataset = (e) => {
    e.preventDefault();
    addDataset(false);
  };

  const handleRemoveDataset = async (name) => {
    if (!window.confirm(`Remove custom dataset "${name}" for everyone?`)) return;
    await removeCustomDataset(name);
    setCustomDatasets(await fetchCustomDatasets());
  };

  const handleThemeToggle = () => {
    setIsDarkMode((value) => {
      localStorage.setItem('theme', value ? 'light' : 'dark');
      return !value;
    });
  };

  const dark = isDarkMode;
  const card = dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200';
  const text = dark ? 'text-gray-100' : 'text-gray-900';
  const subtle = dark ? 'text-gray-400' : 'text-gray-500';
  const hoverRow = dark ? 'hover:bg-gray-800/60' : 'hover:bg-gray-50';
  const secondaryBtn = `rounded-lg border px-3 py-1.5 text-sm font-medium transition ${dark ? 'border-gray-700 text-gray-200 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`;
  const linkText = dark ? 'text-indigo-300 hover:text-indigo-200' : 'text-indigo-600 hover:text-indigo-700';
  const chip = (active) => `rounded-full px-3 py-1 text-sm font-medium transition ${
    active
      ? 'bg-indigo-600 text-white'
      : dark ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'
  }`;

  const bcState = bcSummary?.status || runState(latestBc);
  const diffState = runState(latestDiff);
  const bcLink = resultsHref(latestBc);
  const diffLink = resultsHref(latestDiff);

  return (
    <div className={`${dark ? 'bg-black' : 'bg-gray-50'} min-h-screen`}>
      <Header isDarkMode={dark} handleThemeToggle={handleThemeToggle} />

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className={`text-2xl font-bold tracking-tight ${text}`}>Dashboard</h1>
            <p className={`mt-1 text-sm ${subtle}`}>
              Milo visual regression and agent health checks on self-hosted Mac minis.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href={DATA_URL} target="_blank" rel="noopener noreferrer" className={secondaryBtn}>Baseline data ↗</a>
            <Link to="/console" className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
              ▶ New run
            </Link>
          </div>
        </div>

        {runsError && loaded && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            Live run status is unavailable right now ({runsError}). Sites and results still work.
          </div>
        )}

        {/* Status overview */}
        <section className="grid gap-4 md:grid-cols-3" aria-label="Status overview">
          <div className={`rounded-xl border p-5 ${card}`}>
            <div className={`text-xs font-semibold uppercase tracking-wider ${subtle}`}>Latest screenshot diff</div>
            {latestDiff ? (
              <>
                <div className={`mt-2 truncate text-lg font-semibold ${text}`}>{latestDiff.site}</div>
                <div className={`mt-1 flex items-center gap-2 ${subtle}`}>
                  <StatusPill state={diffState} />
                  <span className="text-xs">· {KIND_LABEL[latestDiff.runKind] || latestDiff.runKind} · {timeAgo(latestDiff.startedAt)}</span>
                </div>
                <div className="mt-4 flex gap-3 text-sm font-semibold">
                  {diffLink && <a href={diffLink} target="_blank" rel="noopener noreferrer" className={linkText}>View results ↗</a>}
                  <Link to="/console" className={linkText}>Open console</Link>
                </div>
              </>
            ) : <p className={`mt-2 text-sm ${subtle}`}>{loaded ? 'No runs yet.' : 'Loading…'}</p>}
          </div>

          <div className={`rounded-xl border p-5 ${card}`}>
            <div className={`text-xs font-semibold uppercase tracking-wider ${subtle}`}>Brand Concierge</div>
            {latestBc ? (
              <>
                <div className={`mt-2 flex items-baseline gap-2 ${text}`}>
                  <span className="text-lg font-semibold">
                    {bcSummary ? `${bcSummary.passed}/${bcSummary.total} checks` : latestBc.done ? 'Completed' : 'Running…'}
                  </span>
                </div>
                <div className={`mt-1 flex items-center gap-2 ${subtle}`}>
                  <StatusPill state={bcState} />
                  <span className="text-xs">· {timeAgo(latestBc.startedAt)}</span>
                </div>
                <div className="mt-4 flex gap-3 text-sm font-semibold">
                  {bcLink && <a href={bcLink} target="_blank" rel="noopener noreferrer" className={linkText}>View report ↗</a>}
                  <Link to="/bc-agent" className={linkText}>Open BC workflow</Link>
                </div>
              </>
            ) : <p className={`mt-2 text-sm ${subtle}`}>{loaded ? 'No BC runs yet.' : 'Loading…'}</p>}
          </div>

          <div className={`rounded-xl border p-5 ${card}`}>
            <div className={`text-xs font-semibold uppercase tracking-wider ${subtle}`}>Activity</div>
            <dl className="mt-2 grid grid-cols-3 gap-2">
              <div>
                <dt className={`text-xs ${subtle}`}>Running</dt>
                <dd className={`text-2xl font-semibold ${running.length ? 'text-sky-500' : text}`}>{running.length}</dd>
              </div>
              <div>
                <dt className={`text-xs ${subtle}`}>Last 24h</dt>
                <dd className={`text-2xl font-semibold ${text}`}>{today.length}</dd>
              </div>
              <div>
                <dt className={`text-xs ${subtle}`}>Pass rate</dt>
                <dd className={`text-2xl font-semibold ${text}`}>{passRate === null ? '–' : `${passRate}%`}</dd>
              </div>
            </dl>
            <p className={`mt-3 text-xs ${subtle}`}>Pass rate over the last {finished.length || 0} finished runs.</p>
          </div>
        </section>

        {/* Quick start */}
        <section aria-label="Quick start">
          <h2 className={`mb-3 text-sm font-semibold ${text}`}>Quick start</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_START.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`group rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${card}`}
              >
                <div className="text-xl" aria-hidden="true">{item.icon}</div>
                <div className={`mt-2 text-sm font-semibold ${text} group-hover:text-indigo-500`}>{item.title}</div>
                <p className={`mt-1 text-xs leading-5 ${subtle}`}>{item.detail}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* Sites */}
        <section aria-label="Screenshot diff sites">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1">
              <h2 className={`mr-2 text-sm font-semibold ${text}`}>Sites</h2>
              {['ALL', ...Object.keys(groups)].map((name) => (
                <button key={name} type="button" className={chip(group === name)} onClick={() => setGroup(name)}>
                  {name === 'ALL' ? 'All' : name.charAt(0) + name.slice(1).toLowerCase()}
                  <span className="ml-1 text-xs opacity-70">
                    {name === 'ALL' ? Object.values(groups).flat().length : groups[name].length}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter sites…"
                aria-label="Filter sites"
                className={`w-44 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${dark ? 'border-gray-800 bg-gray-900 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
              />
              <button type="button" onClick={() => setShowAddForm((value) => !value)} className={secondaryBtn}>
                + Add dataset
              </button>
            </div>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddDataset} className={`mb-4 flex flex-wrap items-center gap-2 rounded-xl border p-4 ${card}`}>
              <input
                autoFocus
                type="text"
                value={newDatasetName}
                onChange={(e) => {
                  setNewDatasetName(e.target.value);
                  setAddError('');
                  setMissingSheet(null);
                }}
                placeholder="dataset name, e.g. bacom-live-qa2"
                className={`min-w-[200px] flex-1 rounded-lg border px-3 py-2 text-sm ${dark ? 'border-gray-700 bg-gray-800 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
              />
              <button type="submit" disabled={adding} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                {adding ? 'Adding…' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewDatasetName('');
                  setAddError('');
                  setMissingSheet(null);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${dark ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Cancel
              </button>
              {addError && (
                <div className="flex w-full flex-wrap items-center gap-2 text-xs text-red-500">
                  <span>{addError}</span>
                  {missingSheet && (
                    <>
                      <a href={missingSheet.url} target="_blank" rel="noreferrer" className="underline">Open sheet URL</a>
                      <button type="button" disabled={adding} onClick={() => addDataset(true)} className="rounded border border-red-400 px-2 py-0.5 font-medium hover:bg-red-50 dark:hover:bg-red-950">
                        Add anyway
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className={`w-full text-xs ${subtle}`}>
                Shared with everyone. The baseline URL list lives at{' '}
                <code>https://milo.adobe.com/drafts/nala/screenshotdiff/data/&#123;name&#125;.json</code>; run it once from the console to get results.
              </div>
            </form>
          )}

          {sites.length === 0 ? (
            <div className={`rounded-xl border border-dashed p-8 text-center text-sm ${dark ? 'border-gray-700 text-gray-400' : 'border-gray-300 text-gray-500'}`}>
              {filter ? `No sites match “${filter}”.` : 'No custom datasets yet — use + Add dataset.'}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sites.map(({ site, group: siteGroup }) => {
                const last = lastRunBySite[site];
                return (
                  <div key={`${siteGroup}-${site}`} className={`group relative flex items-center gap-3 rounded-xl border p-4 transition hover:shadow-md ${card}`}>
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradientFor(site)} text-sm font-bold text-white`}>
                      {initials(site)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link to={`/imagediff/${site}`} className={`block truncate font-semibold ${text} hover:text-indigo-500`}>
                        {site}
                        <span className="absolute inset-0" aria-hidden="true" />
                      </Link>
                      <div className={`mt-0.5 truncate text-xs ${subtle}`}>
                        {last
                          ? <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${styleFor(runState(last)).dot}`} />Last run {timeAgo(last.startedAt)}</span>
                          : siteGroup === 'CUSTOM' ? 'Custom dataset' : siteGroup.charAt(0) + siteGroup.slice(1).toLowerCase()}
                      </div>
                    </div>
                    <div className="relative z-10 flex items-center gap-1">
                      <Link
                        to={`/console?site=${encodeURIComponent(site)}`}
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${dark ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}
                        title={`Run a new screenshot diff for ${site}`}
                      >
                        ▶ Run
                      </Link>
                      {siteGroup === 'CUSTOM' && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDataset(site)}
                          title="Remove this dataset"
                          aria-label={`Remove ${site}`}
                          className={`rounded-md px-1.5 py-1 text-xs ${dark ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent runs */}
        <section aria-label="Recent runs">
          <h2 className={`mb-3 text-sm font-semibold ${text}`}>Recent runs</h2>
          <div className={`overflow-hidden rounded-xl border ${card}`}>
            {runs.length === 0 ? (
              <p className={`p-5 text-sm ${subtle}`}>{loaded ? 'No runs yet.' : 'Loading…'}</p>
            ) : (
              <ul className={`divide-y ${dark ? 'divide-gray-800' : 'divide-gray-100'}`}>
                {runs.slice(0, 8).map((run) => {
                  const href = resultsHref(run);
                  return (
                    <li key={run.runId} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm ${hoverRow}`}>
                      <span className="w-32 shrink-0"><StatusPill state={runState(run)} /></span>
                      <span className={`w-32 shrink-0 text-xs ${subtle}`}>{KIND_LABEL[run.runKind] || run.runKind}</span>
                      <span className={`min-w-0 flex-1 truncate font-medium ${text}`} title={run.urls?.[0] || run.site}>{run.site}</span>
                      <span className={`w-20 shrink-0 text-right text-xs ${subtle}`}>{timeAgo(run.startedAt)}</span>
                      <span className="flex w-40 shrink-0 justify-end gap-3 text-xs font-semibold">
                        {href && <a href={href} target="_blank" rel="noopener noreferrer" className={linkText}>Results ↗</a>}
                        {run.htmlUrl && <a href={run.htmlUrl} target="_blank" rel="noopener noreferrer" className={subtle}>GitHub ↗</a>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default HomePage;
