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
const PROMOTE_BATCH_BASE = `${SHAREPOINT_BASE}_layouts/15/Doc.aspx?sourcedoc=%7B{id}%7D&file=promote-batch-2k.xlsx&action=default&mobileredirect=true`;
const LOC_BASE = `https://adobe.sharepoint.com/sites/adobecom/Shared%20Documents/Forms/AllItems.aspx?newTargetListUrl=%2Fsites%2Fadobecom%2FShared%20Documents&viewpath=%2Fsites%2Fadobecom%2FShared%20Documents%2FForms%2FAllItems%2Easpx&id=%2Fsites%2Fadobecom%2FShared%20Documents%2F{directory}%2Dgraybox%2Fdrafts%2Flocalization%2Fjackyloc&viewid=d776cf70%2D9b7e%2D4ab7%2Db9da%2D9e0f8e03a7d2`;

const testResultsLinks = {
  'graybox-homepage': {
    promote: PROMOTE_BASE.replace('{id}', 'ED68EF15-FEE9-4E1F-BA59-DAC1E465C645'),
    promotebatch: PROMOTE_BATCH_BASE.replace('{id}', '074FE327-957A-4BEF-B2A9-38D9599A98E6'),
    loc: LOC_BASE.replace('{directory}', 'homepage')
  },
  'graybox-dc': {
    promote: PROMOTE_BASE.replace('{id}', 'F7A2C477-5147-4973-A8C4-A4C26B64F9CD'),
    promotebatch: PROMOTE_BATCH_BASE.replace('{id}', '88A67876-B936-47CC-B9DB-44338E7FC1C6'),
    loc: LOC_BASE.replace('{directory}', 'dc')
  },
  'graybox-cc': {
    promote: PROMOTE_BASE.replace('{id}', 'F61F81F7-F112-40EA-968F-2FAF01C2938D'),
    promotebatch: PROMOTE_BATCH_BASE.replace('{id}', '609B570C-619C-461C-8668-7AC4C0D4253E'),
    loc: 'https://adobe.sharepoint.com/sites/adobecom/CC/Forms/AllItems.aspx?newTargetListUrl=%2Fsites%2Fadobecom%2FCC&viewpath=%2Fsites%2Fadobecom%2FCC%2FForms%2FAllItems%2Easpx&id=%2Fsites%2Fadobecom%2FCC%2Fwww%2Dgraybox%2Fdrafts%2Flocalization%2Fjackyloc&viewid=820c5cd2%2Dfd43%2D4244%2D92c4%2Dbe6ed86f524e'
  },
  'graybox-bacom': {
    promote: PROMOTE_BASE.replace('{id}', 'BACF3853-3534-48AF-B252-2AAC17F0801D'),
    promotebatch: PROMOTE_BATCH_BASE.replace('{id}', 'D5DAC35A-5828-4DCE-BAC8-364F014D0B27'),
    loc: LOC_BASE.replace('{directory}', 'bacom')
  },
  'graybox-feds': {
    promote: PROMOTE_BASE.replace('{id}', 'A8238599-7245-462D-8863-BC37CACFAC32'),
    promotebatch: PROMOTE_BATCH_BASE.replace('{id}', 'B140BBB4-AA58-4B3D-94C2-82CC43D673A3'),
    loc: LOC_BASE.replace('{directory}', 'federal')
  },
  'da-bacom-graybox': {
    promote: `${SHAREPOINT_BASE}da-bacom-promote`,
    promotebatch: PROMOTE_BATCH_BASE.replace('{id}', 'xxxx'),
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
                                            Promote Smoke Test
                                        </a>
                                        <a 
                                            className="btn btn-info w-full" 
                                            href={testResultsLinks[directory]?.promotebatch}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Promote Batch(2k)
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