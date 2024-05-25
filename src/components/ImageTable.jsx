/* eslint-disable react/prop-types */
import { useState, useEffect } from 'react';

// Function to check if image exists
const checkImageExists = (url) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
};

const ImageWithFallback = ({ src, alt, handleClick, style }) => {
  const [imageExists, setImageExists] = useState(false);

  useEffect(() => {
    let isMounted = true;
    checkImageExists(src).then((exists) => {
      if (isMounted) setImageExists(exists);
    });
    return () => {
      isMounted = false;
    };
  }, [src]);

  if (!imageExists) {
    if (alt.includes('Differences')) return 'No Difference';
    return 'No Image';
  }

  return <img src={src} alt={alt} style={style} onClick={handleClick} />;
};

const ImageTable = ({ HOST, item, handleShow }) => (
  <>
    <td>
      <ImageWithFallback 
        src={`${HOST}/${item.a}`} 
        alt="Stable version" 
        style={{ width: "100px", cursor: 'pointer' }} 
        handleClick={() => handleShow(`${HOST}/${item.a}`, '')} 
      />
    </td>
    <td>
      <ImageWithFallback 
        src={`${HOST}/${item.b}`} 
        alt="Beta version" 
        style={{ width: "100px", cursor: 'pointer' }} 
        handleClick={() => handleShow(`${HOST}/${item.b}`, '')} 
      />
    </td>
    <td>
      <ImageWithFallback 
        src={`${HOST}/${item.diff}`} 
        alt="Differences version" 
        style={{ width: "100px", cursor: 'pointer' }} 
        handleClick={() => handleShow(`${HOST}/${item.diff}`, '')} 
      />
    </td>
  </>
);

export default ImageTable;
