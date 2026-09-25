import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { fetchCustomDatasets, CUSTOM_DATASETS_EVENT } from '../lib/customDatasets';

const menuData = {
  MILOCORE: ['milo', 'caas', 'uar', 'feds'],
  CONSUMER: ['sot', 'homepage', 'dc', 'cc', 'bacom', 'bacom-blog', 'express'],
  GRAYBOX: ['graybox-homepage', 'graybox-dc', 'graybox-cc', 'graybox-bacom', 'graybox-feds'],
  DA: ['da-homepage', 'da-dc', 'da-cc', 'da-bacom', 'da-bacom-blog', 'da-feds']
};

const Header = ({ isDarkMode, handleThemeToggle, activeMenu, setActiveMenu }) => {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredMenu, setHoveredMenu] = useState(null);
  const menuRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [customDatasets, setCustomDatasets] = useState([]);

  // Custom datasets (added via the Home page "+ Add dataset" button) are
  // persisted server-side (shared across everyone) — keep this nav in sync.
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

  const displayMenuData = useMemo(
    () => (customDatasets.length ? { ...menuData, CUSTOM: customDatasets } : menuData),
    [customDatasets],
  );

  const searchData = useMemo(
    () =>
      Object.values(displayMenuData)
        .flat()
        .map((item) => ({ title: item, url: `/imagediff/${item}`, type: 'page' })),
    [displayMenuData],
  );
  const searchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setHoveredMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleMenuClick = (menu) => {
    if (activeMenu === menu) {
      setHoveredMenu(hoveredMenu === menu ? null : menu);
    } else {
      setActiveMenu(menu);
      setHoveredMenu(menu);
    }
  };

  const handleJsonView = (item, e) => {
    e.stopPropagation();
    setHoveredMenu(null);
    setIsMenuOpen(false);
    navigate(`/json-viewer/${item}`);
    window.location.reload();
  };

  const renderMenuItem = (item, menu) => {
    if (menu === 'GRAYBOX') {
      return (
        <div
          key={item}
          className={`py-2 border-b last:border-b-0 ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}
        >
          {/* Item name as a header */}
          <div className={`px-4 py-1 text-xs ${isDarkMode ? 'bg-gray-900 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
            {item}
          </div>
          <div className="flex">
            {/* Screen Diff Link - Left Column */}
            <div
              className={`flex-1 border-r transition-colors duration-150 ${
                isDarkMode ? 'border-gray-700 hover:bg-gray-700/60' : 'border-gray-100 hover:bg-gray-50'
              }`}
            >
              <Link
                to={`/imagediff/${item}`}
                className={`px-4 py-2 text-sm font-medium hover:text-primary flex items-center gap-2 group ${
                  isDarkMode ? 'text-gray-200' : 'text-gray-700'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setHoveredMenu(null);
                  setIsMenuOpen(false);
                }}
              >
                <svg className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="group-hover:translate-x-1 transition-transform">Screen Diff</span>
              </Link>
            </div>

            {/* JSON Viewer Link - Right Column */}
            <div className={`flex-1 transition-colors duration-150 ${isDarkMode ? 'hover:bg-gray-700/60' : 'hover:bg-gray-50'}`}>
              <button
                onClick={(e) => handleJsonView(item, e)}
                className={`px-4 py-2 text-sm flex items-center gap-2 group w-full ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}
              >
                <svg className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <span className="group-hover:translate-x-1 transition-transform">JSON View</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <Link
        key={item}
        to={`/imagediff/${item}`}
        className={`px-4 py-2 text-sm group flex items-center gap-2 transition-colors duration-150 ${
          isDarkMode ? 'text-gray-200 hover:bg-gray-700/60' : 'text-gray-700 hover:bg-gray-50'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          setHoveredMenu(null);
          setIsMenuOpen(false);
        }}
      >
        <svg className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="group-hover:translate-x-1 transition-transform">{item}</span>
      </Link>
    );
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      setSearchResults([]);
      return;
    }

    const filtered = searchData.filter(item =>
      item.title.toLowerCase().includes(query.toLowerCase())
    );
    setSearchResults(filtered);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsSearching(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const searchBar = (
    <div ref={searchRef} className="relative flex-1 max-w-xl mx-4">
      <div className="relative">
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => setIsSearching(true)}
          className={`w-full px-4 py-2 rounded-lg border ${
            isDarkMode 
              ? 'bg-gray-800 border-gray-700 text-white' 
              : 'bg-white border-gray-200 text-gray-900'
          } focus:outline-none focus:ring-2 focus:ring-primary`}
        />
        <svg
          className={`absolute right-3 top-2.5 w-5 h-5 ${
            isDarkMode ? 'text-gray-400' : 'text-gray-500'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {isSearching && searchResults.length > 0 && (
        <div className={`absolute mt-2 w-full rounded-lg shadow-lg ${
          isDarkMode ? 'bg-gray-800' : 'bg-white'
        } ring-1 ring-black ring-opacity-5 z-50`}>
          <div className="py-1">
            {searchResults.map((result) => (
              <Link
                key={result.title}
                to={result.url}
                onClick={() => {
                  setIsSearching(false);
                  setSearchQuery('');
                }}
                className={`block px-4 py-2 text-sm ${
                  isDarkMode 
                    ? 'text-gray-200 hover:bg-gray-700' 
                    : 'text-gray-700 hover:bg-gray-50'
                } transition-colors duration-150`}
              >
                {result.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <nav
      className={`px-4 py-2.5 sticky top-0 z-50 border-b backdrop-blur supports-[backdrop-filter]:bg-opacity-90 ${
        isDarkMode ? 'bg-gray-950/95 border-gray-800' : 'bg-white/95 border-gray-200'
      }`}
    >
      <div className="container mx-auto flex justify-between items-center">
        <Link
          to="/"
          className={`flex items-center gap-2 text-lg font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-sky-500 text-sm text-white">
            N
          </span>
          Auto Tests Dashboard
        </Link>

        <div className="hidden md:block flex-1 max-w-xl mx-4">
          {searchBar}
        </div>

        <div className="md:hidden">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={isDarkMode ? 'text-white' : 'text-gray-900'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        <div
          ref={menuRef}
          className={`md:flex ${isMenuOpen ? 'block' : 'hidden'} absolute md:relative top-16 md:top-0 left-0 right-0 md:right-auto border-b md:border-0 ${
            isDarkMode ? 'bg-gray-950 border-gray-800' : 'bg-white border-gray-200'
          } md:bg-transparent`}
        >
          <ul className="md:flex items-center space-y-1 md:space-y-0 md:space-x-1 p-3 md:p-0">
            {Object.keys(displayMenuData).map((menu) => (
              <li key={menu} className="relative group">
                <button
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-150 flex items-center gap-1.5 ${
                    activeMenu === menu
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : isDarkMode
                        ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                  onClick={() => handleMenuClick(menu)}
                >
                  <span>{menu}</span>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${hoveredMenu === menu ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <div
                  className={`
                  ${hoveredMenu === menu ? 'block opacity-100 translate-y-0' : 'hidden opacity-0 -translate-y-2'}
                  absolute left-0 mt-2 w-56 rounded-lg shadow-lg ring-1 z-50 transform transition-all duration-200
                  ${isDarkMode ? 'bg-gray-800 ring-gray-700' : 'bg-white ring-black ring-opacity-5'}
                `}
                >
                  <div className="py-1 rounded-lg overflow-hidden">
                    {displayMenuData[menu].map((item) => renderMenuItem(item, menu))}
                  </div>
                </div>
              </li>
            ))}
            <li className="md:ml-2">
              <label
                className={`flex cursor-pointer gap-2 items-center rounded-full px-2.5 py-1.5 ${
                  isDarkMode ? 'bg-gray-800 text-amber-300' : 'bg-gray-100 text-gray-500'
                }`}
                title="Toggle dark mode"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
                <input type="checkbox" value="dark" className="toggle toggle-sm theme-controller" onChange={handleThemeToggle} checked={isDarkMode}/>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
              </label>
            </li>
          </ul>
        </div>

        <div className="md:hidden block w-full mt-4">
          {isMenuOpen && searchBar}
        </div>
      </div>
    </nav>
  );
};

Header.propTypes = {
  isDarkMode: PropTypes.bool.isRequired,
  handleThemeToggle: PropTypes.func.isRequired,
  activeMenu: PropTypes.string,
  setActiveMenu: PropTypes.func
};

export default Header; 