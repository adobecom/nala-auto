import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ImageDiff from '../components/ImageDiff';
import Header from '../components/Header';
import Breadcrumb from '../components/Breadcrumb';

async function getData(directory) {
  try {
    const res = await fetch(`/api/milo/screenshots/${directory}/results.json`, { cache: 'no-store' });
    if (!res.ok) {
      console.log(`HTTP error! status: ${res.status}`);
      return {};
    }
    const data = await res.json();
    return data;
  } catch (error) {
    return {};
  }
}

async function getTimestamp(directory) {
  try {
    const res = await fetch(`/api/milo/screenshots/${directory}/timestamp.json`, { cache: 'no-store' });
    return await res.json();
  } catch (error) {
    return '';
  }
}

async function getTimestampBase(directory) {
  try {
    const res = await fetch(`/api/milo/screenshots/${directory}/timestampbase.json`, { cache: 'no-store' });
    if (!res.ok) {
      console.log(`timestampbase.json not accessible (${res.status}), using timestamp instead`);
      return '';
    }
    return await res.json();
  } catch (error) {
    console.log(`Error fetching timestampbase.json:`, error.message);
    return '';
  }
}

const ImageDiffPage = () => {
  const { directory } = useParams();
  const [data, setData] = useState({});
  const [timestamp, setTimestamp] = useState('');
  const [timestampBase, setTimestampBase] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState('MILOCORE');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    
    const fetchData = async () => {
      const data = await getData(directory);
      const timestamp = await getTimestamp(directory);
      const timestampBase = await getTimestampBase(directory);
      setData(data);
      setTimestamp(timestamp);
      if (timestampBase) {
        setTimestampBase(timestampBase);
      } else {
        setTimestampBase(timestamp);
      }
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

  const breadcrumbItems = [
    { label: directory }
  ];

  return (
    <div className={`${isDarkMode ? 'bg-black' : 'bg-white'} min-h-screen`}>
      <Header 
        isDarkMode={isDarkMode} 
        handleThemeToggle={handleThemeToggle}
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
      />
      <Breadcrumb items={breadcrumbItems} isDarkMode={isDarkMode} activeMenu={activeMenu}/>
      <div className="container mx-auto p-4">
        <ImageDiff data={data} timestamp={timestamp} timestampBase={timestampBase} isDarkMode={isDarkMode} />
      </div>
    </div>
  );
};

export default ImageDiffPage;
