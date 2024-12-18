import { useEffect, useState } from 'react';
import Header from '../components/Header';
import Breadcrumb from '../components/Breadcrumb';

const menuData = {
  MILOCORE: ['sot', 'milo', 'caas', 'uar', 'uar-ai', 'feds'],
  CONSUMER: ['homepage', 'dc', 'cc', 'bacom', 'bacom-blog'],
  GRAYBOX: ['graybox-homepage', 'graybox-dc', 'graybox-cc', 'graybox-bacom', 'graybox-feds', 'da-bacom-graybox'],
  DA: ['da-homepage', 'da-dc', 'da-cc', 'da-bacom', 'da-bacom-blog', 'da-feds']
};

const HomePage = () => {
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [activeMenu, setActiveMenu] = useState('MILOCORE');

    useEffect(() => {
        // Check for saved theme preference in localStorage
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            setIsDarkMode(true);
            document.documentElement.classList.add('dark');
        }
    }, []);

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
        { label: 'Dashboard' }
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

            <div className='container mx-auto pb-5 pt-4'>
                {/* Cards */}
                <div className='text-xl flex flex-row gap-6 m-3 flex-wrap'>
                    {menuData[activeMenu].map((directory, index) => (
                        <div key={index} className="card w-80 bg-base-100 shadow-xl hover:shadow-2xl transition-shadow duration-200">
                            <figure className="px-4 pt-4">
                                <img src="dog.jpg" alt={`${index}`} className="rounded-xl" />
                            </figure>
                            <div className="card-body items-center text-center">
                                <h2 className={`card-title uppercase ${isDarkMode ? 'text-white' : 'text-black'}`}>
                                    {directory}
                                </h2>
                                <p className={`${isDarkMode ? 'text-white' : 'text-black'}`}>
                                    screenshots under three resolutions
                                </p>
                                <div className="card-actions gap-2">
                                    <a 
                                        className="btn btn-primary" 
                                        href={`/imagediff/${directory}`}
                                    >
                                        Check
                                    </a>
                                    {directory.includes('graybox') && (
                                        <a 
                                            className="btn btn-secondary" 
                                            href={`/json-viewer/${directory}`}
                                        >
                                            View JSON
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default HomePage;