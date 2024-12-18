import { useEffect, useState } from 'react';
import Header from '../components/Header';
import Breadcrumb from '../components/Breadcrumb';

const menuData = {
  MILOCORE: ['sot', 'milo', 'caas', 'uar', 'uar-ai', 'feds'],
  CONSUMER: ['homepage', 'dc', 'cc', 'bacom', 'bacom-blog'],
  GRAYBOX: ['graybox-homepage', 'graybox-dc', 'graybox-cc', 'graybox-bacom', 'graybox-feds', 'da-bacom-graybox'],
  DA: ['da-homepage', 'da-dc', 'da-cc', 'da-bacom', 'da-bacom-blog', 'da-feds']
};

const SHAREPOINT_BASE = 'https://adobe.sharepoint.com/:x:/r/sites/adobecom/';
const PROMOTE_BASE = `${SHAREPOINT_BASE}_layouts/15/Doc.aspx?sourcedoc=%7B{id}%7D&file=promote-smoke.xlsx&action=default&mobileredirect=true`;

const testResultsLinks = {
  'graybox-homepage': {
    promote: PROMOTE_BASE.replace('{id}', 'ED68EF15-FEE9-4E1F-BA59-DAC1E465C645'),
    loc: `${SHAREPOINT_BASE}homepage-loc`
  },
  'graybox-dc': {
    promote: PROMOTE_BASE.replace('{id}', 'F7A2C477-5147-4973-A8C4-A4C26B64F9CD'),
    loc: `${SHAREPOINT_BASE}dc-loc`
  },
  'graybox-cc': {
    promote: PROMOTE_BASE.replace('{id}', 'F61F81F7-F112-40EA-968F-2FAF01C2938D'),
    loc: `${SHAREPOINT_BASE}cc-loc`
  },
  'graybox-bacom': {
    promote: PROMOTE_BASE.replace('{id}', 'BACF3853-3534-48AF-B252-2AAC17F0801D'),
    loc: 'https://main--bacom-graybox--adobecom.hlx.page/tools/loc?milolibs=locui&ref=main&repo=bacom-graybox&owner=adobecom&host=business.adobe.com&project=BACOM&referrer=https%3A%2F%2Fadobe.sharepoint.com%2F%3Ax%3A%2Fr%2Fsites%2Fadobecom%2F_layouts%2F15%2FDoc.aspx%3Fsourcedoc%3D%257B5888e09b-93a3-4bc7-8f0f-d751da9f5a89%257D%26action%3Deditnew'
  },
  'graybox-feds': {
    promote: PROMOTE_BASE.replace('{id}', 'A8238599-7245-462D-8863-BC37CACFAC32'),
    loc: `${SHAREPOINT_BASE}feds-loc`
  },
  'da-bacom-graybox': {
    promote: `${SHAREPOINT_BASE}da-bacom-promote`,
    loc: `${SHAREPOINT_BASE}da-bacom-loc`
  }
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
                <div className='text-xl flex flex-row gap-6 m-3 flex-wrap justify-center'>
                    {menuData[activeMenu].map((directory, index) => (
                        <div key={index} 
                             className={`card w-96 ${isDarkMode ? 'bg-gray-800' : 'bg-base-100'} 
                                       shadow-xl hover:shadow-2xl transition-all duration-300 
                                       transform hover:-translate-y-1`}>
                            <figure className="px-6 pt-6">
                                <img 
                                    src="dog.jpg" 
                                    alt={`${directory} preview`} 
                                    className="rounded-xl h-48 w-full object-cover" 
                                />
                            </figure>
                            <div className="card-body items-center text-center p-6">
                                <h2 className={`card-title uppercase ${isDarkMode ? 'text-white' : 'text-black'} 
                                             text-xl font-bold mb-2`}>
                                    {directory}
                                </h2>
                                <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'} text-sm mb-4`}>
                                    Visual comparison and performance metrics
                                </p>
                                <div className="card-actions flex flex-col w-full gap-2">
                                    <a 
                                        className="btn btn-primary w-full" 
                                        href={`/imagediff/${directory}`}
                                    >
                                        Screenshot Diff
                                    </a>
                                    {directory.includes('graybox') && (
                                        <>
                                        <a 
                                            className="btn btn-secondary w-full" 
                                            href={`/json-viewer/${directory}`}
                                        >
                                            Page Load Check
                                        </a>
                                        <a 
                                            className="btn btn-info w-full" 
                                            href={testResultsLinks[directory]?.promote}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Promote Tests
                                        </a>
                                        <a 
                                            className="btn btn-success w-full" 
                                            href={testResultsLinks[directory]?.loc}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Loc Tests
                                        </a>
                                        </>
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