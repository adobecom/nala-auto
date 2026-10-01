import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { fetchCustomDatasets, CUSTOM_DATASETS_EVENT } from '../lib/customDatasets';
import { SITE_GROUPS } from '../lib/sites';

const PAGES = [
  { title: 'Dashboard', url: '/', type: 'Page' },
  { title: 'Milo releases (Stage to Main)', url: '/releases', type: 'Page' },
  { title: 'Run a dataset (Run console)', url: '/console', type: 'Workflow' },
  { title: 'Quick URL check', url: '/console?mode=quick', type: 'Workflow' },
  { title: 'Compare with Figma', url: '/console?mode=figma', type: 'Workflow' },
  { title: 'BC agent monitor', url: '/bc-agent', type: 'Workflow' },
  { title: 'Manual iOS Safari', url: '/manual-ios', type: 'Workflow' },
  { title: 'Mac mini runners', url: '/runners', type: 'Page' },
];

// Navigation lives in the AppShell sidebar; the top bar is search + theme only.
const Header = ({ isDarkMode, handleThemeToggle }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [customDatasets, setCustomDatasets] = useState([]);
  const searchRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const refresh = () => fetchCustomDatasets().then(setCustomDatasets);
    refresh();
    window.addEventListener(CUSTOM_DATASETS_EVENT, refresh);
    return () => window.removeEventListener(CUSTOM_DATASETS_EVENT, refresh);
  }, []);

  const entries = useMemo(() => {
    const groups = customDatasets.length ? { ...SITE_GROUPS, CUSTOM: customDatasets } : SITE_GROUPS;
    const sites = Object.entries(groups).flatMap(([group, items]) =>
      items.map((site) => ({ title: site, url: `/imagediff/${site}`, type: group })));
    return [...PAGES, ...sites];
  }, [customDatasets]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return entries.filter((entry) => entry.title.toLowerCase().includes(q)).slice(0, 8);
  }, [entries, query]);

  useEffect(() => setHighlight(0), [query]);

  useEffect(() => {
    const onClick = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const go = (entry) => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    navigate(entry.url);
  };

  const onInputKey = (event) => {
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((value) => (value + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((value) => (value - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(results[highlight]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const bar = isDarkMode ? 'bg-gray-950/90 border-gray-800' : 'bg-white/90 border-gray-200';
  const input = isDarkMode
    ? 'bg-gray-900 border-gray-800 text-gray-100 placeholder-gray-500'
    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400';

  return (
    <nav className={`sticky top-0 z-50 border-b px-4 py-2.5 backdrop-blur ${bar}`}>
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className={`flex items-center gap-2 font-bold tracking-tight md:hidden ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-sky-500 text-sm text-white">N</span>
        </Link>

        <div ref={searchRef} className="relative w-full max-w-md">
          <svg className={`pointer-events-none absolute left-3 top-2.5 h-4 w-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Jump to a site or workflow…"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onInputKey}
            aria-label="Search sites and workflows"
            className={`w-full rounded-lg border py-2 pl-9 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${input}`}
          />
          <kbd className={`pointer-events-none absolute right-2.5 top-2 rounded border px-1.5 text-[11px] ${isDarkMode ? 'border-gray-700 text-gray-500' : 'border-gray-300 text-gray-400'}`}>/</kbd>

          {open && results.length > 0 && (
            <ul className={`absolute z-50 mt-2 w-full overflow-hidden rounded-lg py-1 shadow-lg ring-1 ${isDarkMode ? 'bg-gray-900 ring-gray-800' : 'bg-white ring-black/5'}`}>
              {results.map((entry, index) => (
                <li key={entry.url}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => go(entry)}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                      index === highlight
                        ? isDarkMode ? 'bg-gray-800 text-white' : 'bg-indigo-50 text-indigo-900'
                        : isDarkMode ? 'text-gray-200' : 'text-gray-700'
                    }`}
                  >
                    <span>{entry.title}</span>
                    <span className={`text-[11px] uppercase tracking-wide ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{entry.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={handleThemeToggle}
          className={`ml-auto flex h-9 w-9 items-center justify-center rounded-lg transition ${isDarkMode ? 'bg-gray-900 text-amber-300 hover:bg-gray-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          )}
        </button>
      </div>
    </nav>
  );
};

Header.propTypes = {
  isDarkMode: PropTypes.bool.isRequired,
  handleThemeToggle: PropTypes.func.isRequired,
  activeMenu: PropTypes.string,
  setActiveMenu: PropTypes.func,
};

export default Header;
