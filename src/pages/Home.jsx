import { useEffect, useState } from 'react';
const directories = ['sot', 'milo', 'feds', 'caas', 'uar', 'uar-ai', 'dc', 'bacom', 'graybox-bacom', 'graybox-dc'];

const HomePage = () => {
    const [isDarkMode, setIsDarkMode] = useState(false);

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

    return (
        <div className={`${isDarkMode ? 'bg-black' : 'bg-white'}`}>
            <div className="m-5 pt-4">
                <label className="flex cursor-pointer gap-2 justify-end">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
                <input type="checkbox" value="dark" className="toggle theme-controller" onChange={handleThemeToggle}/>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                </label>
                <div className={`text-3xl text-center ${isDarkMode ? 'text-white' : 'text-black'}`}>Auto Tests</div>
            </div>
            <div className='pb-5'>
                <div className={`m-2 text-2xl ${isDarkMode ? 'text-white' : 'text-black'}`}>Screenshot Tests:</div>
                <div className='text-xl flex flex-row gap-6 m-3 flex-wrap'>
                    {directories.map((directory, index) => (
                    <div className="card w-80 bg-base-100 shadow-xl flex" key={index}>
                        <figure>
                        <img src="dog.jpg" alt={`${index}`} />
                        </figure>
                        <div className="card-body items-center text-center">
                        <h2 className={`card-title uppercase ${isDarkMode ? 'text-white' : 'text-black'}`}>{directory}</h2>
                        <p className={`${isDarkMode ? 'text-white' : 'text-black'}`}>screenshots under three resolutions</p>
                        <div className="card-actions">
                            <a className="btn btn-primary" href={`/imagediff/${directory}`}>Check</a>
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