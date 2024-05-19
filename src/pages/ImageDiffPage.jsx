import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ImageDiff from '../components/ImageDiff';

async function getData(category) {
  try {
    const res = await fetch(`/api/milo/screenshots/${category}/results.json`, { cache: 'no-store' });
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

async function getTimestamp(category) {
  try {
    const res = await fetch(`/api/milo/screenshots/${category}/timestamp.json`, { cache: 'no-store' });
    return await res.json();
  } catch (error) {
    return '';
  }
}

const ImageDiffPage = () => {
  const { category } = useParams();
  const [data, setData] = useState({});
  const [timestamp, setTimestamp] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const data = await getData(category);
      const timestamp = await getTimestamp(category);
      setData(data);
      setTimestamp(timestamp);
    };
    fetchData();
  }, [category]);

  return (
    <div>
      <ImageDiff data={data} timestamp={timestamp} />
    </div>
  );
};

export default ImageDiffPage;
