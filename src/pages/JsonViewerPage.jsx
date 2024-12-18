import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Header from '../components/Header';
import Breadcrumb from '../components/Breadcrumb';

const JsonViewerPage = () => {
    const { grayboxType } = useParams();
    const [jsonData, setJsonData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeMenu, setActiveMenu] = useState('GRAYBOX');

    useEffect(() => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            setIsDarkMode(true);
            document.documentElement.classList.add('dark');
        }
        fetchJsonData();
    }, []);

    const getJsonUrl = (type) => {
        const baseUrl = '/nala/view/0.Milo/job';
        switch (type) {
            case 'graybox-bacom':
                return `${baseUrl}/GrayboxBacomTests/lastSuccessfulBuild/artifact/graybox-bacom-404-results.json`;
            case 'graybox-cc':
                return `${baseUrl}/GrayboxCCTests/lastSuccessfulBuild/artifact/graybox-cc-404-results.json`;
            case 'graybox-dc':
                return `${baseUrl}/GrayboxDCTests/lastSuccessfulBuild/artifact/graybox-dc-404-results.json`;
            case 'graybox-homepage':
                return `${baseUrl}/GrayboxHomepageTests/lastSuccessfulBuild/artifact/graybox-homepage-404-results.json`;
            case 'graybox-feds':
                return `${baseUrl}/GrayboxFedsTests/lastSuccessfulBuild/artifact/graybox-feds-404-results.json`;
            default:
                return null;
        }
    };

    const fetchJsonData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const url = getJsonUrl(grayboxType);
            if (!url) {
                throw new Error('Invalid graybox type');
            }
            const response = await fetch(url);
            const data = await response.json();
            setJsonData(data);
        } catch (err) {
            setError('Failed to fetch JSON data');
            console.error('Error fetching JSON:', err);
        } finally {
            setIsLoading(false);
        }
    };

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

    const filteredData = jsonData
        ? Object.entries(jsonData).filter(([key]) =>
            key.toLowerCase().includes(searchTerm.toLowerCase()))
        : [];

    const renderErrorCount = (errors) => {
        if (!errors || errors.length === 0) {
            return <span className="text-success">0</span>;
        }
        return <span className="text-error">{errors.length}</span>;
    };

    const renderErrorDetails = (errors, type) => {
        if (!errors || errors.length === 0) return null;
        return (
            <div className="mb-2">
                <div className="font-semibold text-info">{type}:</div>
                <div className="ml-2">
                    {errors.map((err, i) => (
                        <div key={i} className="text-sm mb-1">
                            • {err}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const breadcrumbItems = [
        { label: 'JSON Viewer' },
        { label: grayboxType }
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
                {isLoading && (
                    <div className="flex justify-center items-center h-64">
                        <div className="loading loading-spinner loading-lg"></div>
                    </div>
                )}

                {error && (
                    <div className="alert alert-error">
                        <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span>{error}</span>
                    </div>
                )}

                {jsonData && (
                    <div className={`card ${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow-xl`}>
                        <div className="card-body">
                            <div className="form-control w-full max-w-xs mb-4">
                                <input
                                    type="text"
                                    placeholder="Search pages..."
                                    className="input input-bordered w-full"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="overflow-x-auto">
                                <table className="table table-zebra w-full">
                                    <thead>
                                        <tr className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>
                                            <th className="w-1/6">Page</th>
                                            <th className="w-1/12">404 Errors</th>
                                            <th className="w-1/12">Console Errors</th>
                                            <th className="w-1/12">Network Errors</th>
                                            <th className="w-1/12">Status</th>
                                            <th className="w-5/12">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredData.map(([page, data]) => (
                                            <tr key={page} className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>
                                                <td className="font-medium">{page}</td>
                                                <td>{renderErrorCount(data.fourOFourErrors)}</td>
                                                <td>{renderErrorCount(data.consoleErrors)}</td>
                                                <td>{renderErrorCount(data.networkErrors)}</td>
                                                <td>
                                                    <span className={`badge ${
                                                        (data.fourOFourErrors?.length || 
                                                         data.consoleErrors?.length || 
                                                         data.networkErrors?.length) 
                                                            ? 'badge-error' 
                                                            : 'badge-success'
                                                    }`}>
                                                        {(data.fourOFourErrors?.length || 
                                                          data.consoleErrors?.length || 
                                                          data.networkErrors?.length) 
                                                            ? 'Failed' 
                                                            : 'Passed'}
                                                    </span>
                                                </td>
                                                <td className="max-w-xl whitespace-normal">
                                                    {renderErrorDetails(data.fourOFourErrors, '404 Errors')}
                                                    {renderErrorDetails(data.consoleErrors, 'Console Errors')}
                                                    {renderErrorDetails(data.networkErrors, 'Network Errors')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default JsonViewerPage; 