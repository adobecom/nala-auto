import { useEffect, useState } from 'react';
import Header from '../components/Header';
import Breadcrumb from '../components/Breadcrumb';

const menuData = {
  MILOCORE: ['milo', 'caas', 'uar', 'feds'],
  CONSUMER: ['sot', 'homepage', 'dc', 'cc', 'bacom', 'bacom-blog', 'express'],
  GRAYBOX: ['graybox-homepage', 'graybox-dc', 'graybox-cc', 'graybox-bacom', 'graybox-federal', 'da-bacom-graybox'],
  DA: ['da-homepage', 'da-dc', 'da-cc', 'da-bacom', 'da-bacom-blog', 'da-feds'],
};

const SHAREPOINT_BASE = 'https://adobe.sharepoint.com/:x:/r/sites/adobecom/';
const PROMOTE_SMOKE_FILES_BASE = 'https://adobe.sharepoint.com/sites/adobecom/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2Fadobecom%2FShared%20Documents%2F{directory}%2Dgraybox%2Fpromote%2Dsmoke&viewid=d776cf70%2D9b7e%2D4ab7%2Db9da%2D9e0f8e03a7d2';
const PROMOTE_BASE = `${SHAREPOINT_BASE}_layouts/15/Doc.aspx?sourcedoc=%7B{id}%7D&file=promote-smoke.xlsx&action=default&mobileredirect=true`;
const PROMOTE_BATCH_BASE = `${SHAREPOINT_BASE}_layouts/15/Doc.aspx?sourcedoc=%7B{id}%7D&file=promote-batch-2k.xlsx&action=default&mobileredirect=true`;
const LOC_BASE = `https://adobe.sharepoint.com/sites/adobecom/Shared%20Documents/Forms/AllItems.aspx?newTargetListUrl=%2Fsites%2Fadobecom%2FShared%20Documents&viewpath=%2Fsites%2Fadobecom%2FShared%20Documents%2FForms%2FAllItems%2Easpx&id=%2Fsites%2Fadobecom%2FShared%20Documents%2F{directory}%2Dgraybox%2Fdrafts%2Flocalization%2Fjackyloc&viewid=d776cf70%2D9b7e%2D4ab7%2Db9da%2D9e0f8e03a7d2`;
const GRAYBOX_CONFIG_BASE = 'https://main--{directory}-graybox--adobecom.aem.page/.milo/graybox-config.json';
const DATA_URL = 'https://adobe.sharepoint.com/sites/adobecom/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2Fadobecom%2FShared%20Documents%2Fmilo%2Fdrafts%2Fnala%2Fscreenshotdiff%2Fdata&viewid=d776cf70%2D9b7e%2D4ab7%2Db9da%2D9e0f8e03a7d2';

const testResultsLinks = {
  'graybox-homepage': {
    promote: PROMOTE_BASE.replace('{id}', '9946776B-A9D2-46E3-986D-02831BB54F12'),
    promotebatch: PROMOTE_BATCH_BASE.replace('{id}', '074FE327-957A-4BEF-B2A9-38D9599A98E6'),
    loc: LOC_BASE.replace('{directory}', 'homepage'),
    promoteFiles: PROMOTE_SMOKE_FILES_BASE.replace('{directory}', 'homepage'),
  },
  'graybox-dc': {
    promote: PROMOTE_BASE.replace('{id}', '32424CED-6DCE-4CC5-978B-E615084B07C4'),
    promotebatch: PROMOTE_BATCH_BASE.replace('{id}', '88A67876-B936-47CC-B9DB-44338E7FC1C6'),
    loc: LOC_BASE.replace('{directory}', 'dc'),
    promoteFiles: PROMOTE_SMOKE_FILES_BASE.replace('{directory}', 'dc'),
  },
  'graybox-cc': {
    promote: PROMOTE_BASE.replace('{id}', '37D0371D-0195-4B03-8EA2-C9A907DD3799'),
    promotebatch: PROMOTE_BATCH_BASE.replace('{id}', '609B570C-619C-461C-8668-7AC4C0D4253E'),
    loc: 'https://adobe.sharepoint.com/sites/adobecom/CC/Forms/AllItems.aspx?newTargetListUrl=%2Fsites%2Fadobecom%2FCC&viewpath=%2Fsites%2Fadobecom%2FCC%2FForms%2FAllItems%2Easpx&id=%2Fsites%2Fadobecom%2FCC%2Fwww%2Dgraybox%2Fdrafts%2Flocalization%2Fjackyloc&viewid=820c5cd2%2Dfd43%2D4244%2D92c4%2Dbe6ed86f524e',
    promoteFiles: 'https://adobe.sharepoint.com/sites/adobecom/CC/Forms/AllItems.aspx?newTargetListUrl=%2Fsites%2Fadobecom%2FCC&viewpath=%2Fsites%2Fadobecom%2FCC%2FForms%2FAllItems%2Easpx&id=%2Fsites%2Fadobecom%2FCC%2Fwww%2Dgraybox%2Fpromote%2Dsmoke&viewid=820c5cd2%2Dfd43%2D4244%2D92c4%2Dbe6ed86f524e',
  },
  'graybox-bacom': {
    promote: PROMOTE_BASE.replace('{id}', '22C5750A-A6AC-4C6E-9FF3-4E301D3A5CF7'),
    promotebatch: PROMOTE_BATCH_BASE.replace('{id}', 'D5DAC35A-5828-4DCE-BAC8-364F014D0B27'),
    loc: LOC_BASE.replace('{directory}', 'bacom'),
    promoteFiles: PROMOTE_SMOKE_FILES_BASE.replace('{directory}', 'bacom'),
  },
  'graybox-federal': {
    promote: PROMOTE_BASE.replace('{id}', '71c416af-0c9a-4344-b43c-0d496646ff88'),
    promotebatch: PROMOTE_BATCH_BASE.replace('{id}', 'B140BBB4-AA58-4B3D-94C2-82CC43D673A3'),
    loc: LOC_BASE.replace('{directory}', 'federal'),
    promoteFiles: PROMOTE_SMOKE_FILES_BASE.replace('{directory}', 'federal'),
  },
  'da-bacom-graybox': {
    promote: `${SHAREPOINT_BASE}da-bacom-promote`,
    promotebatch: PROMOTE_BATCH_BASE.replace('{id}', 'xxxx'),
    loc: `${SHAREPOINT_BASE}da-bacom-loc`,
    promoteFiles: PROMOTE_SMOKE_FILES_BASE.replace('{directory}', 'da-bacom'),
  },
};

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
const initials = (s) => s.replace(/^(graybox|da)-/, '').slice(0, 2).toUpperCase();

const HomePage = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState('MILOCORE');

  useEffect(() => {
    if (localStorage.getItem('theme') === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

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

  const miniLink = `text-xs ${isDarkMode ? 'text-gray-400 hover:text-indigo-300' : 'text-gray-500 hover:text-indigo-600'} hover:underline`;

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
              href={DATA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-lg px-4 py-2.5 text-sm font-medium ${isDarkMode ? 'text-gray-200 hover:bg-gray-800' : 'text-gray-700 hover:bg-white'}`}
            >
              📁 Baseline data ↗
            </a>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {['Desktop · chrome / ipad / iphone', 'Real iOS · Simulator (full-page)', 'Auto → S3 → results'].map((f) => (
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
        </div>

        {/* Site cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {menuData[activeMenu].map((directory) => {
            const isGraybox = directory.includes('graybox');
            const links = testResultsLinks[directory] || {};
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

                {isGraybox && (
                  <>
                    <a
                      href={`/json-viewer/${directory}`}
                      className={`mt-2 rounded-lg border px-4 py-2 text-center text-sm font-medium ${isDarkMode ? 'border-gray-700 text-gray-200 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                      Page Load Check
                    </a>
                    <div className={`mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t pt-3 ${isDarkMode ? 'border-gray-800' : 'border-gray-100'}`}>
                      <a className={miniLink} href={GRAYBOX_CONFIG_BASE.replace('{directory}', directory.replace('graybox-', ''))} target="_blank" rel="noopener noreferrer">Config ↗</a>
                      <a className={miniLink} href={links.promoteFiles} target="_blank" rel="noopener noreferrer">Smoke files ↗</a>
                      <a className={miniLink} href={links.promote} target="_blank" rel="noopener noreferrer">Smoke test ↗</a>
                      <a className={miniLink} href={links.promotebatch} target="_blank" rel="noopener noreferrer">Batch 2k ↗</a>
                      <a className={miniLink} href={links.loc} target="_blank" rel="noopener noreferrer">Loc ↗</a>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default HomePage;
