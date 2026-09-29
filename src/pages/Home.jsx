import { useEffect, useState } from 'react';
import Header from '../components/Header';
import Breadcrumb from '../components/Breadcrumb';
import {
  fetchCustomDatasets,
  addCustomDataset,
  removeCustomDataset,
  CUSTOM_DATASETS_EVENT,
} from '../lib/customDatasets';
import { SITE_GROUPS as menuData } from '../lib/sites';

const DATA_URL = 'https://adobe.sharepoint.com/sites/adobecom/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2Fadobecom%2FShared%20Documents%2Fmilo%2Fdrafts%2Fnala%2Fscreenshotdiff%2Fdata&viewid=d776cf70%2D9b7e%2D4ab7%2Db9da%2D9e0f8e03a7d2';

// Stable gradient per site name (no external images).
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

const HomePage = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState('MILOCORE');
  const [customDatasets, setCustomDatasets] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('theme') === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  // Custom datasets are persisted server-side (shared across everyone), so
  // keep this tab's copy fresh — on mount, and whenever this tab or another
  // one adds/removes one.
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

  const handleAddDataset = async (e) => {
    e.preventDefault();
    setAdding(true);
    const name = await addCustomDataset(newDatasetName);
    setAdding(false);
    if (!name) {
      setAddError('Enter a valid dataset name (letters, numbers, hyphens).');
      return;
    }
    setCustomDatasets(await fetchCustomDatasets());
    setNewDatasetName('');
    setAddError('');
    setShowAddForm(false);
    setActiveMenu('CUSTOM');
  };

  const handleRemoveDataset = async (name) => {
    await removeCustomDataset(name);
    setCustomDatasets(await fetchCustomDatasets());
  };

  const handleThemeToggle = () => {
    setIsDarkMode((v) => {
      const nv = !v;
      document.documentElement.classList.toggle('dark', nv);
      localStorage.setItem('theme', nv ? 'dark' : 'light');
      return nv;
    });
  };

  const page = isDarkMode ? 'bg-black' : 'bg-gray-50';
  const card = isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200';
  const text = isDarkMode ? 'text-gray-100' : 'text-gray-900';
  const subtle = isDarkMode ? 'text-gray-400' : 'text-gray-500';

  const tabBtn = (active) =>
    `rounded-lg px-4 py-2 text-sm font-semibold transition ${
      active
        ? 'bg-indigo-600 text-white shadow'
        : isDarkMode
          ? 'text-gray-300 hover:bg-gray-800'
          : 'text-gray-600 hover:bg-gray-100'
    }`;


  return (
    <div className={`${page} min-h-screen`}>
      <Header
        isDarkMode={isDarkMode}
        handleThemeToggle={handleThemeToggle}
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
      />
      <Breadcrumb items={[{ label: 'Dashboard' }]} isDarkMode={isDarkMode} activeMenu={activeMenu} />

      <div className="container mx-auto max-w-6xl px-4 pb-10">
        {/* Hero */}
        <section
          className={`mb-8 overflow-hidden rounded-2xl border ${isDarkMode ? 'border-gray-800' : 'border-gray-200'} bg-gradient-to-br ${isDarkMode ? 'from-gray-900 to-gray-950' : 'from-indigo-50 to-white'} p-8`}
        >
          <h1 className={`text-3xl font-bold tracking-tight ${text}`}>Nala Auto</h1>
          <p className={`mt-2 max-w-2xl ${subtle}`}>
            Milo visual regression — screenshot diffs across desktop viewports and{' '}
            <span className={text}>real iOS Safari</span>, running on self-hosted Mac minis and
            published straight to the results below.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href="/console"
              className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white shadow transition hover:bg-indigo-700"
            >
              ▶ Run Console
            </a>
            <a
              href="/console?mode=quick"
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${isDarkMode ? 'bg-gray-800 text-indigo-300 hover:bg-gray-700' : 'bg-white text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50'}`}
              title="Paste a few URLs and diff them without setting up a dataset"
            >
              ⚡ Quick run
            </a>
            <a
              href="/console?mode=figma"
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${isDarkMode ? 'bg-gray-800 text-fuchsia-300 hover:bg-gray-700' : 'bg-white text-fuchsia-700 ring-1 ring-fuchsia-200 hover:bg-fuchsia-50'}`}
              title="Diff one page region against the matching Figma frame"
            >
              🎨 Figma compare
            </a>
            <a
              href="/manual-ios"
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${isDarkMode ? 'bg-gray-800 text-emerald-300 hover:bg-gray-700' : 'bg-white text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50'}`}
            >
              📱 Manual iOS Safari
            </a>
            <a
              href="/bc-agent"
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${isDarkMode ? 'bg-gray-800 text-sky-300 hover:bg-gray-700' : 'bg-white text-sky-700 ring-1 ring-sky-200 hover:bg-sky-50'}`}
              title="Chat with Brand Concierge like a user and check which workflows it reaches"
            >
              💬 BC workflow
            </a>
            <a
              href={DATA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-lg px-4 py-2.5 text-sm font-medium ${isDarkMode ? 'text-gray-200 hover:bg-gray-800' : 'text-gray-700 hover:bg-white'}`}
            >
              📁 Baseline data ↗
            </a>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {['Desktop · chrome / ipad / iphone', 'Real iOS · Simulator (full-page)', 'Figma · design vs live region', 'Auto → S3 → results'].map((f) => (
              <span
                key={f}
                className={`rounded-full px-3 py-1 text-xs font-medium ${isDarkMode ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-600 ring-1 ring-gray-200'}`}
              >
                {f}
              </span>
            ))}
          </div>
        </section>

        {/* Category tabs */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {Object.keys(menuData).map((m) => (
            <button key={m} className={tabBtn(activeMenu === m)} onClick={() => setActiveMenu(m)}>
              {m}
              <span className={`ml-1.5 text-xs ${activeMenu === m ? 'text-indigo-200' : subtle}`}>
                {menuData[m].length}
              </span>
            </button>
          ))}
          <button className={tabBtn(activeMenu === 'CUSTOM')} onClick={() => setActiveMenu('CUSTOM')}>
            CUSTOM
            <span className={`ml-1.5 text-xs ${activeMenu === 'CUSTOM' ? 'text-indigo-200' : subtle}`}>
              {customDatasets.length}
            </span>
          </button>
          <button
            onClick={() => {
              setActiveMenu('CUSTOM');
              setShowAddForm(true);
            }}
            className={`ml-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${isDarkMode ? 'bg-gray-800 text-indigo-300 hover:bg-gray-700' : 'bg-white text-indigo-600 ring-1 ring-gray-200 hover:bg-indigo-50'}`}
            title="Add a new screenshot-diff dataset"
          >
            + Add dataset
          </button>
        </div>

        {/* Inline "add dataset" form */}
        {showAddForm && (
          <form onSubmit={handleAddDataset} className={`mb-5 flex flex-wrap items-center gap-2 rounded-xl border p-4 ${card}`}>
            <input
              autoFocus
              type="text"
              value={newDatasetName}
              onChange={(e) => {
                setNewDatasetName(e.target.value);
                setAddError('');
              }}
              placeholder="dataset name, e.g. bacom-live-qa2"
              className={`flex-1 min-w-[200px] rounded-lg border px-3 py-2 text-sm ${isDarkMode ? 'border-gray-700 bg-gray-800 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
            />
            <button
              type="submit"
              disabled={adding}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setNewDatasetName('');
                setAddError('');
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${isDarkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Cancel
            </button>
            {addError && <div className="w-full text-xs text-red-500">{addError}</div>}
            <div className={`w-full text-xs ${subtle}`}>
              Adds a site name (shared with everyone) to the picker in <strong>▶ Run Console</strong>. It only shows
              diffs once someone runs it there — the baseline URL list lives at{' '}
              <code>https://milo.adobe.com/drafts/nala/screenshotdiff/data/&#123;name&#125;.json</code>.
            </div>
          </form>
        )}

        {/* Site cards */}
        {activeMenu === 'CUSTOM' ? (
          customDatasets.length === 0 ? (
            <div className={`rounded-xl border border-dashed p-8 text-center text-sm ${isDarkMode ? 'border-gray-700 text-gray-400' : 'border-gray-300 text-gray-500'}`}>
              No custom datasets yet — click <strong>+ Add dataset</strong> above to add one.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {customDatasets.map((directory) => (
                <div key={directory} className={`relative flex flex-col rounded-xl border p-5 shadow-sm transition hover:shadow-md ${card}`}>
                  <button
                    onClick={() => handleRemoveDataset(directory)}
                    title="Remove this dataset"
                    className={`absolute right-3 top-3 text-xs ${isDarkMode ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`}
                  >
                    ✕
                  </button>
                  <div className="mb-3 flex items-center gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br ${gradientFor(directory)} text-sm font-bold text-white`}>
                      {initials(directory)}
                    </div>
                    <div className="min-w-0">
                      <div className={`truncate font-semibold ${text}`}>{directory}</div>
                      <div className={`text-xs ${subtle}`}>Custom dataset</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`/console?site=${encodeURIComponent(directory)}`}
                      className={`flex-1 rounded-lg border px-3 py-2 text-center text-sm font-semibold transition ${isDarkMode ? 'border-gray-700 text-gray-200 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                      ▶ Run
                    </a>
                    <a
                      href={`/imagediff/${directory}`}
                      className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-indigo-700"
                    >
                      Screenshot Diff →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {menuData[activeMenu].map((directory) => {
            return (
              <div key={directory} className={`flex flex-col rounded-xl border p-5 shadow-sm transition hover:shadow-md ${card}`}>
                <div className="mb-3 flex items-center gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br ${gradientFor(directory)} text-sm font-bold text-white`}>
                    {initials(directory)}
                  </div>
                  <div className="min-w-0">
                    <div className={`truncate font-semibold ${text}`}>{directory}</div>
                    <div className={`text-xs ${subtle}`}>Visual regression &amp; checks</div>
                  </div>
                </div>

                <a
                  href={`/imagediff/${directory}`}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  Screenshot Diff →
                </a>

              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
