import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Breadcrumb from '../components/Breadcrumb';
import Header from '../components/Header';

const REFRESH_MS = 15000;

const STATUS = {
  busy: { label: 'Busy', dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  idle: { label: 'Idle', dot: 'bg-green-500', chip: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  offline: { label: 'Offline', dot: 'bg-gray-400', chip: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  quiet: { label: 'Quiet', dot: 'bg-gray-400', chip: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  seen: { label: 'Active today', dot: 'bg-sky-500', chip: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
};

const CONCLUSION = {
  success: 'text-green-600 dark:text-green-400',
  failure: 'text-red-600 dark:text-red-400',
  timed_out: 'text-red-600 dark:text-red-400',
  cancelled: 'text-gray-500',
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

function JobLink({ job, now, subtle }) {
  const when = job.status === 'in_progress'
    ? `running ${ago(job.startedAt, now)}`
    : `${job.conclusion || job.status} · ${ago(job.completedAt || job.startedAt, now)} ago`;
  return (
    <a href={job.htmlUrl} target="_blank" rel="noreferrer" className="block hover:underline">
      <span className="font-medium">{job.workflow}</span>
      <span className={subtle}> · {job.name}</span>
      <span className={`ml-1 ${CONCLUSION[job.conclusion] || subtle}`}>({when})</span>
    </a>
  );
}

JobLink.propTypes = {
  job: PropTypes.shape({
    status: PropTypes.string,
    conclusion: PropTypes.string,
    startedAt: PropTypes.string,
    completedAt: PropTypes.string,
    htmlUrl: PropTypes.string,
    workflow: PropTypes.string,
    name: PropTypes.string,
  }).isRequired,
  now: PropTypes.number.isRequired,
  subtle: PropTypes.string.isRequired,
};

export default function RunnersPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState('MILOCORE');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/lab/runners', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setData(body);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
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

  const totals = data?.totals;
  const fromApi = data?.source === 'runners-api';
  const tiles = totals
    ? [
      { label: 'Runners', value: totals.runners },
      { label: 'Busy', value: totals.busy, key: 'busy' },
      ...(fromApi
        ? [{ label: 'Idle', value: totals.idle, key: 'idle' }, { label: 'Offline', value: totals.offline, key: 'offline' }]
        : [
          { label: `Active in ${data.windowHours}h`, value: totals.seen, key: 'seen' },
          { label: `Quiet > ${data.windowHours}h`, value: totals.quiet, key: 'quiet' },
        ]),
      { label: 'Queued jobs', value: totals.queued },
    ]
    : [];

  return (
    <div className={`${page} min-h-screen`}>
      <Header
        isDarkMode={isDarkMode}
        handleThemeToggle={handleThemeToggle}
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
      />
      <Breadcrumb items={[{ label: 'Runners' }]} isDarkMode={isDarkMode} activeMenu={activeMenu} />

      <main className={`container mx-auto max-w-5xl space-y-6 p-4 ${text}`}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">Self-hosted runners</h1>
            <p className={`text-sm ${subtle}`}>
              Mac mini pool
              {data?.owner ? ` for ${data.owner}/${data.repo}` : ''}
              {' '}· refreshes every {REFRESH_MS / 1000}s
              {data?.updatedAt ? ` · updated ${ago(data.updatedAt, now)} ago` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className={`rounded-lg border px-3 py-1.5 text-sm ${card} hover:opacity-80`}
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {data?.mode === 'mock' && (
          <div className={`rounded-xl border p-4 text-sm shadow-sm ${card}`}>{data.message}</div>
        )}

        {!data && !error && <p className={subtle}>Loading runner status…</p>}

        {totals && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {tiles.map((tile) => (
              <div key={tile.label} className={`rounded-xl border p-3 shadow-sm ${card}`}>
                <div className={`flex items-center gap-2 text-xs ${subtle}`}>
                  {tile.key && <span className={`h-2 w-2 rounded-full ${STATUS[tile.key].dot}`} />}
                  {tile.label}
                </div>
                <div className="mt-1 text-2xl font-semibold">{tile.value}</div>
              </div>
            ))}
          </div>
        )}

        {data?.runners?.length > 0 && (
          <section className={`overflow-hidden rounded-xl border shadow-sm ${card}`}>
            <h2 className="border-b px-4 py-3 font-semibold dark:border-gray-800">Runners</h2>
            <ul className={`divide-y ${divider}`}>
              {data.runners.map((runner) => {
                const status = STATUS[runner.status] || STATUS.seen;
                return (
                  <li key={runner.name} className="grid gap-2 px-4 py-3 sm:grid-cols-[14rem_1fr]">
                    <div>
                      <div className="flex items-center gap-2 font-medium">
                        <span className={`h-2.5 w-2.5 rounded-full ${status.dot}`} />
                        {runner.name}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${status.chip}`}>{status.label}</span>
                        {runner.labels.map((label) => (
                          <span key={label} className={`rounded px-1.5 py-0.5 text-xs ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1 text-sm">
                      {runner.current && <JobLink job={runner.current} now={now} subtle={subtle} />}
                      {runner.last && (
                        <div className={runner.current ? subtle : ''}>
                          <span className={subtle}>Last: </span>
                          <JobLink job={runner.last} now={now} subtle={subtle} />
                        </div>
                      )}
                      {!runner.current && !runner.last && <span className={subtle}>No jobs in the last {data.windowHours}h</span>}
                      <div className={`text-xs ${subtle}`}>
                        {runner.jobs} job{runner.jobs === 1 ? '' : 's'} in {data.windowHours}h
                        {runner.failures ? ` · ${runner.failures} failed` : ''}
                        {runner.lastSeen ? ` · last seen ${ago(runner.lastSeen, now)} ago` : ''}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {data?.queued?.length > 0 && (
          <section className={`overflow-hidden rounded-xl border shadow-sm ${card}`}>
            <h2 className="border-b px-4 py-3 font-semibold dark:border-gray-800">Waiting for a runner</h2>
            <ul className={`divide-y ${divider} text-sm`}>
              {data.queued.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <a href={job.htmlUrl} target="_blank" rel="noreferrer" className="hover:underline">
                    <span className="font-medium">{job.workflow}</span>
                    <span className={subtle}> · {job.name}</span>
                  </a>
                  <span className={subtle}>
                    [{job.labels.join(', ')}] · waiting {ago(job.createdAt, now)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data?.recent?.length > 0 && (
          <section className={`overflow-hidden rounded-xl border shadow-sm ${card}`}>
            <h2 className="border-b px-4 py-3 font-semibold dark:border-gray-800">Recent jobs</h2>
            <ul className={`divide-y ${divider} text-sm`}>
              {data.recent.map((job) => (
                <li key={job.id} className="grid gap-1 px-4 py-2 sm:grid-cols-[10rem_1fr_auto]">
                  <span className="font-medium">{job.runner}</span>
                  <a href={job.htmlUrl} target="_blank" rel="noreferrer" className="hover:underline">
                    {job.workflow}<span className={subtle}> · {job.name}</span>
                  </a>
                  <span className={CONCLUSION[job.conclusion] || subtle}>
                    {job.status === 'completed' ? job.conclusion : 'running'} · {ago(job.startedAt, now)} ago
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
