import { Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

const menuData = {
  MILOCORE: ['sot', 'milo', 'caas', 'uar', 'uar-ai', 'feds'],
  CONSUMER: ['homepage', 'dc', 'cc', 'bacom', 'bacom-blog'],
  GRAYBOX: ['graybox-homepage', 'graybox-dc', 'graybox-cc', 'graybox-bacom', 'graybox-feds'],
  DA: ['da-homepage', 'da-dc', 'da-cc', 'da-bacom', 'da-bacom-blog', 'da-feds']
};

const Header = ({ isDarkMode, handleThemeToggle, activeMenu, setActiveMenu }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredMenu, setHoveredMenu] = useState(null);
  const menuRef = useRef(null);

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

  return (
    <nav className={`${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'} p-4 sticky top-0 z-50 shadow-md`}>
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-black'}`}>
          Auto Tests Dashboard
        </Link>
        
        <div className="md:hidden">
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`${isDarkMode ? 'text-white' : 'text-black'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        <div ref={menuRef} className={`md:flex ${isMenuOpen ? 'block' : 'hidden'} absolute md:relative top-16 md:top-0 left-0 right-0 md:right-auto ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'} md:bg-transparent`}>
          <ul className="md:flex space-y-2 md:space-y-0 md:space-x-4 p-4 md:p-0">
            {Object.keys(menuData).map((menu) => (
              <li key={menu} className="relative group">
                <button
                  className={`${isDarkMode ? 'text-white' : 'text-black'} hover:text-gray-500 px-3 py-2 rounded-md text-sm font-medium ${activeMenu === menu ? 'bg-primary text-white' : ''}`}
                  onClick={() => handleMenuClick(menu)}
                >
                  {menu}
                </button>
                
                <div className={`${hoveredMenu === menu ? 'block' : 'hidden'} absolute left-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50`}>
                  <div className="py-1">
                    {menuData[menu].map((item) => (
                      <Link
                        key={item}
                        to={`/imagediff/${item}`}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHoveredMenu(null);
                          setIsMenuOpen(false);
                        }}
                      >
                        {item}
                      </Link>
                    ))}
                  </div>
                </div>
              </li>
            ))}
            <li>
              <label className="flex cursor-pointer gap-2 items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
                <input type="checkbox" value="dark" className="toggle theme-controller" onChange={handleThemeToggle} checked={isDarkMode}/>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
              </label>
            </li>
          </ul>
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