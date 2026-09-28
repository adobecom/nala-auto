import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import ImageDiff from '../components/ImageDiff';
import Header from '../components/Header';
import { resultsPath, RUN_QUERY_PARAM } from '../lib/resultPaths';

async function getData(path, onProgress) {
  try {
    const res = await fetch(`/api/milo/screenshots/${path}/results.json`, { cache: 'no-store' });
    if (!res.ok) return null;

    const total = parseInt(res.headers.get('content-length') || '0', 10);
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total) onProgress(Math.round((received / total) * 100));
    }

    const text = new TextDecoder().decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.length + chunk.length);
        merged.set(acc);
        merged.set(chunk, acc.length);
        return merged;
      }, new Uint8Array(0))
    );

    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function getTimestamp(path) {
  try {
    const res = await fetch(`/api/milo/screenshots/${path}/timestamp.json`, { cache: 'no-store' });
    return await res.json();
  } catch {
    return '';
  }
}

const ImageDiffPage = () => {
  const { directory } = useParams();
  const [searchParams] = useSearchParams();
  const runId = searchParams.get(RUN_QUERY_PARAM);
  const [data, setData] = useState({});
  const [timestamp, setTimestamp] = useState('');
  // True when ?run= was asked for but only the "latest" copy exists — the
  // per-run copy has either been pruned or was never published.
  const [runMissing, setRunMissing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState('MILOCORE');
  const [progress, setProgress] = useState(0); // 0-100, null = done
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }

    const fetchData = async () => {
      setLoading(true);
      setProgress(0);
      setRunMissing(false);

      // Prefer the pinned run, but fall back to latest so a pruned or
      // not-yet-published run still renders something useful.
      let path = resultsPath(directory, runId);
      let data = await getData(path, setProgress);
      let missing = false;
      if (!data && runId) {
        missing = true;
        path = resultsPath(directory);
        data = await getData(path, setProgress);
      }

      setRunMissing(missing);
      setData(data || {});
      setTimestamp(await getTimestamp(path));
      setProgress(100);
      setLoading(false);
    };
    fetchData();
  }, [directory, runId]);

  const handleThemeToggle = () => {
    setIsDarkMode(!isDarkMode);
    if (!isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <div className={`${isDarkMode ? 'bg-black' : 'bg-white'} min-h-screen`}>
      <Header
        isDarkMode={isDarkMode}
        handleThemeToggle={handleThemeToggle}
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
      />
      {loading ? (
        <div
          className={`flex flex-col items-center justify-center gap-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
          style={{ height: 'calc(100vh - 48px)' }}
        >
          <div className="text-sm font-medium">Loading snapshots… {progress}%</div>
          <div className={`w-64 h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          {runMissing && (
            <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
              Run <code>{runId}</code> is no longer available — showing the latest results instead.
              Dataset runs are kept for up to 7 days (newest 3); quick and Figma runs for 24 hours.
            </div>
          )}
          <ImageDiff data={data} timestamp={timestamp} isDarkMode={isDarkMode} />
        </>
      )}
    </div>
  );
};

export default ImageDiffPage;
