import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ImageDiff from '../components/ImageDiff';

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

const ImageDiffPage = () => {
  const { directory } = useParams();
  const [data, setData] = useState({});
  const [timestamp, setTimestamp] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const data = await getData(directory);
      const timestamp = await getTimestamp(directory);
      setData(data);
      setTimestamp(timestamp);
    };
    fetchData();
  }, [directory]);

  return (
    <div>
      <ImageDiff data={data} timestamp={timestamp} />
    </div>
  );
};

export default ImageDiffPage;
