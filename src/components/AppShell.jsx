import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { fetchCustomDatasets, CUSTOM_DATASETS_EVENT } from '../lib/customDatasets';
import { SITE_GROUPS } from '../lib/sites';

const WORKFLOWS = [
  { label: 'Dashboard', to: '/', icon: '⌂' },
  { label: 'Run console', to: '/console', icon: '▶', status: 'screenshot' },
  { label: 'Quick run', to: '/console?mode=quick', icon: '⚡' },
  { label: 'Figma compare', to: '/console?mode=figma', icon: '◧' },
  { label: 'BC workflow', to: '/bc-agent', icon: '✦', status: 'bc' },
  { label: 'Manual iOS', to: '/manual-ios', icon: '▯' },
];

const DOT = {
  success: 'bg-emerald-500',
  pass: 'bg-emerald-500',
  review: 'bg-amber-500',
  failure: 'bg-rose-500',
  error: 'bg-rose-500',
  cancelled: 'bg-gray-400',
  running: 'bg-sky-500 animate-pulse',
};

const runState = (run) => {
  if (!run) return null;
  if (!run.done) return 'running';
  return run.conclusion || run.status;
};

const isActive = (location, to) => {
  const [path, query = ''] = to.split('?');
  if (path === '/') return location.pathname === '/';
  if (location.pathname !== path) return false;
  const mode = new URLSearchParams(query).get('mode');
  return (new URLSearchParams(location.search).get('mode') || null) === mode;
};

const AppShell = () => {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('navCollapsed') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [latest, setLatest] = useState({});
  const [bcStatus, setBcStatus] = useState(null);
  const [customDatasets, setCustomDatasets] = useState([]);
  const [openGroups, setOpenGroups] = useState(() => {
    const site = location.pathname.match(/^\/imagediff\/([^/]+)/)?.[1];
    const group = Object.entries(SITE_GROUPS).find(([, sites]) => sites.includes(site))?.[0];
    return group ? { [group]: true } : {};
  });

  useEffect(() => {
    localStorage.setItem('navCollapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => setMobileOpen(false), [location.pathname, location.search]);

  // Pages own their theme toggle; mirror it so the sidebar matches.
  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    sync();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const refresh = () => fetchCustomDatasets().then(setCustomDatasets);
    refresh();
    window.addEventListener(CUSTOM_DATASETS_EVENT, refresh);
    return () => window.removeEventListener(CUSTOM_DATASETS_EVENT, refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/lab/runs', { cache: 'no-store' });
        if (!response.ok) return;
        const runs = await response.json();
        if (cancelled || !Array.isArray(runs)) return;
        setLatest({
          bc: runs.find((run) => run.runKind === 'bc'),
          screenshot: runs.find((run) => run.runKind !== 'bc'),
        });
      } catch {
        // Status dots are informational; navigation must keep working.
      }
    };
    load();
    const timer = window.setInterval(load, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const bcRunId = latest.bc?.done ? latest.bc.runId : null;
  useEffect(() => {
    setBcStatus(null);
    if (!bcRunId) return undefined;
    let cancelled = false;
    fetch(`/api/milo/screenshots/bc-agent/runs/${encodeURIComponent(bcRunId)}/workflow-summary.json`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((summary) => {
        if (!cancelled && summary?.status) setBcStatus(summary);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [bcRunId]);

  const statusFor = (kind) => {
    if (kind === 'bc' && bcStatus && latest.bc?.done) {
      return { state: bcStatus.status, title: `Latest BC run ${bcRunId}: ${bcStatus.status.toUpperCase()} ${bcStatus.passed}/${bcStatus.total}` };
    }
    const run = latest[kind];
    const state = runState(run);
    return state ? { state, title: `Latest run ${run.runId}: ${state}` } : null;
  };

  const groups = useMemo(
    () => (customDatasets.length ? { ...SITE_GROUPS, CUSTOM: customDatasets } : SITE_GROUPS),
    [customDatasets],
  );

  const shell = dark ? 'bg-gray-950 border-gray-800 text-gray-200' : 'bg-white border-gray-200 text-gray-700';
  const item = (active) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
    active
      ? 'bg-indigo-600 text-white shadow-sm'
      : dark ? 'hover:bg-gray-800 hover:text-white' : 'hover:bg-gray-100 hover:text-gray-900'
  }`;
  const heading = `px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider ${dark ? 'text-gray-500' : 'text-gray-400'}`;

  const nav = (compact) => (
    <nav className="flex h-full flex-col overflow-y-auto p-3" aria-label="Main navigation">
      <div className={`mb-2 flex items-center ${compact ? 'justify-center' : 'justify-between'} gap-2`}>
        {!compact && <span className="px-2 text-sm font-bold tracking-tight">Nala Auto</span>}
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className={`hidden rounded-md px-2 py-1 text-sm md:block ${dark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
          title={compact ? 'Expand navigation' : 'Collapse navigation'}
          aria-label={compact ? 'Expand navigation' : 'Collapse navigation'}
        >
          {compact ? '»' : '«'}
        </button>
      </div>

      {!compact && <div className={heading}>Workflows</div>}
      <ul className="space-y-1">
        {WORKFLOWS.map((entry) => {
          const active = isActive(location, entry.to);
          const status = entry.status && statusFor(entry.status);
          return (
            <li key={entry.to}>
              <Link to={entry.to} className={`${item(active)} ${compact ? 'justify-center' : ''}`} title={compact ? entry.label : undefined}>
                <span className="relative w-4 text-center" aria-hidden="true">
                  {entry.icon}
                  {compact && status && (
                    <span className={`absolute -right-1.5 -top-1 h-2 w-2 rounded-full ${DOT[status.state] || 'bg-gray-400'}`} />
                  )}
                </span>
                {!compact && <span className="flex-1 truncate">{entry.label}</span>}
                {!compact && status && (
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ${active ? 'ring-white/40' : 'ring-transparent'} ${DOT[status.state] || 'bg-gray-400'}`}
                    title={status.title}
                    aria-label={status.title}
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {!compact && (
        <>
          <div className={heading}>Screenshot diff sites</div>
          <ul className="space-y-1">
            {Object.entries(groups).map(([group, sites]) => (
              <li key={group}>
                <button
                  type="button"
                  onClick={() => setOpenGroups((value) => ({ ...value, [group]: !value[group] }))}
                  className={`${item(false)} w-full justify-between`}
                  aria-expanded={Boolean(openGroups[group])}
                >
                  <span>{group}</span>
                  <span className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {sites.length} {openGroups[group] ? '▾' : '▸'}
                  </span>
                </button>
                {openGroups[group] && (
                  <ul className={`ml-4 mt-1 space-y-0.5 border-l pl-2 ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
                    {sites.map((site) => {
                      const to = `/imagediff/${site}`;
                      return (
                        <li key={site}>
                          <Link to={to} className={`${item(location.pathname === to)} py-1.5 text-[13px]`}>
                            <span className="truncate">{site}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );

  return (
    <div className={`flex min-h-screen ${dark ? 'bg-black' : 'bg-gray-50'}`}>
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 border-r transition-[width] duration-200 md:block ${shell} ${collapsed ? 'w-16' : 'w-60'}`}
      >
        {nav(collapsed)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />
          <aside className={`relative h-full w-64 border-r shadow-xl ${shell}`}>{nav(false)}</aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="fixed bottom-4 left-4 z-[55] rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg md:hidden"
        >
          ☰ Menu
        </button>
        {/* Remount per destination so pages that read query params on mount (e.g. console mode) update. */}
        <div key={`${location.pathname}${location.search}`}>
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AppShell;
