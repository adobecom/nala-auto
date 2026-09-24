import { useEffect, useState } from 'react';
import Breadcrumb from '../components/Breadcrumb';
import Header from '../components/Header';

const ManualIOSPage = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState('MILOCORE');
  const [config, setConfig] = useState(null);
  const [device, setDevice] = useState('');
  const [iosVersion, setIosVersion] = useState('');
  const [url, setUrl] = useState('https://milo.adobe.com/');
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('theme') === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    fetch('/lab/config')
      .then((response) => response.json())
      .then((data) => {
        setConfig(data);
        setDevice(data.iosDevices?.[0] || '');
        setIosVersion(data.iosVersions?.[0] || '');
        setSession(data.manualIos?.session || null);
      })
      .catch(() => setError('Manual iOS service is unavailable. Try again shortly.'));
  }, []);

  const handleThemeToggle = () => {
    setIsDarkMode((current) => {
      const next = !current;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  const startSession = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/lab/manual-ios/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device, iosVersion, url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start the manual iOS session.');
      setSession(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const endSession = async () => {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/lab/manual-ios/session/${encodeURIComponent(session.id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Could not end the manual iOS session.');
      setSession(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const page = isDarkMode ? 'bg-black' : 'bg-gray-50';
  const card = isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200';
  const text = isDarkMode ? 'text-gray-100' : 'text-gray-900';
  const subtle = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const field = isDarkMode
    ? 'bg-gray-800 border-gray-700 text-gray-100'
    : 'bg-white border-gray-300 text-gray-900';

  return (
    <div className={`${page} min-h-screen`}>
      <Header
        isDarkMode={isDarkMode}
        handleThemeToggle={handleThemeToggle}
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
      />
      <Breadcrumb items={[{ label: 'Manual iOS Safari' }]} isDarkMode={isDarkMode} activeMenu={activeMenu} />

      <main className="container mx-auto max-w-5xl p-4">
        <div className="mb-6">
          <h1 className={`text-2xl font-bold ${text}`}>Manual iOS Safari</h1>
          <p className={`mt-1 ${subtle}`}>
            Reserve the dedicated Simulator Mac for interactive Mobile Safari testing. This is separate from automated visual-diff runs.
          </p>
        </div>

        <section className={`rounded-xl border shadow-sm ${card}`}>
          <div className="space-y-5 p-5">
            {!config?.manualIos?.enabled && !error && (
              <div className={`rounded-lg border px-4 py-3 text-sm ${isDarkMode ? 'border-amber-900 bg-amber-950 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
                Manual iOS sessions are not configured yet.
              </div>
            )}
            {error && <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

            {session ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className={`font-semibold ${text}`}>Active session</h2>
                    <p className={`mt-1 text-sm ${subtle}`}>
                      {session.device} · iOS {session.iosVersion} · expires {new Date(session.expiresAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <button
                    onClick={endSession}
                    disabled={busy}
                    className="rounded-lg border border-rose-400 px-4 py-2 text-sm font-semibold text-rose-600 disabled:opacity-50"
                  >
                    {busy ? 'Ending…' : 'End session'}
                  </button>
                </div>
                <iframe
                  title="Manual iOS Simulator"
                  src={session.viewerUrl}
                  className="h-[700px] w-full rounded-lg border"
                  allow="clipboard-read; clipboard-write; fullscreen"
                />
              </>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className={`mb-1 block text-sm font-medium ${subtle}`}>Device</span>
                    <select value={device} onChange={(event) => setDevice(event.target.value)} className={`w-full rounded-lg border px-3 py-2 ${field}`}>
                      {(config?.iosDevices || []).map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className={`mb-1 block text-sm font-medium ${subtle}`}>iOS version</span>
                    <select value={iosVersion} onChange={(event) => setIosVersion(event.target.value)} className={`w-full rounded-lg border px-3 py-2 ${field}`}>
                      {(config?.iosVersions || []).map((item) => <option key={item} value={item}>iOS {item}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className={`mb-1 block text-sm font-medium ${subtle}`}>URL to test</span>
                  <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://stage.example.com/" className={`w-full rounded-lg border px-3 py-2 ${field}`} />
                </label>
                <div className={`rounded-lg px-4 py-3 text-sm ${isDarkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}`}>
                  One shared session is available at a time and automatically releases after {config?.manualIos?.ttlMinutes || 30} minutes.
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={startSession}
                    disabled={!config?.manualIos?.enabled || busy || !device || !iosVersion || !url}
                    className="rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy ? 'Starting…' : 'Start manual session'}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default ManualIOSPage;
