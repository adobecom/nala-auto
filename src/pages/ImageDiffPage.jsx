import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ImageDiff from '../components/ImageDiff';
import Header from '../components/Header';

async function getData(directory, onProgress) {
  try {
    const res = await fetch(`/api/milo/screenshots/${directory}/results.json`, { cache: 'no-store' });
    if (!res.ok) return {};

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
    return {};
  }
}

async function getTimestamp(directory) {
  try {
    const res = await fetch(`/api/milo/screenshots/${directory}/timestamp.json`, { cache: 'no-store' });
    return await res.json();
  } catch {
    return '';
  }
}

const ImageDiffPage = () => {
  const { directory } = useParams();
  const [data, setData] = useState({});
  const [timestamp, setTimestamp] = useState('');
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
      const [data, timestamp] = await Promise.all([
        getData(directory, setProgress),
        getTimestamp(directory),
      ]);
      setData(data);
      setTimestamp(timestamp);
      setProgress(100);
      setLoading(false);
    };
    fetchData();
  }, [directory]);

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
        <ImageDiff data={data} timestamp={timestamp} isDarkMode={isDarkMode} />
      )}
    </div>
  );
};

export default ImageDiffPage;
