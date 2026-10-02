import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import ImageDiff from '../components/ImageDiff';
import Header from '../components/Header';
import { resultsPath, RUN_QUERY_PARAM } from '../lib/resultPaths';
import Sparkline from '../components/Sparkline';
import { useRunHistory, useTrend, acceptBaseline, resetBaseline } from '../lib/visualHistory';

async function getData(path, onProgress) {
  try {
    const res = await fetch(`/api/milo/screenshots/${path}/results.json`, { cache: 'no-store' });
    if (!res.ok) return null;

    const total = parseInt(res.headers.get('content-length') || '0', 10);
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total) onProgress(Math.round((received / total) * 100));
    }

    const text = new TextDecoder().decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.length + chunk.length);
        merged.set(acc);
        merged.set(chunk, acc.length);
        return merged;
      }, new Uint8Array(0))
    );

    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function getTimestamp(path) {
  try {
    const res = await fetch(`/api/milo/screenshots/${path}/timestamp.json`, { cache: 'no-store' });
    return await res.json();
  } catch {
    return '';
  }
}

async function getRunIndex(directory) {
  try {
    const res = await fetch(`/api/milo/screenshots/${resultsPath(directory)}/runs/index.json`, { cache: 'no-store' });
    if (!res.ok) return [];
    const list = await res.json();
    return Array.isArray(list) ? list.filter((e) => e && e.runId) : [];
  } catch {
    return [];
  }
}

const ImageDiffPage = () => {
  const { directory } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const runId = searchParams.get(RUN_QUERY_PARAM);
  const [data, setData] = useState({});
  const [timestamp, setTimestamp] = useState('');
  // True when ?run= was asked for but only the "latest" copy exists — the
  // per-run copy has either been pruned or was never published.
  const [runMissing, setRunMissing] = useState(false);
  const [runs, setRuns] = useState([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState('MILOCORE');
  const [progress, setProgress] = useState(0); // 0-100, null = done
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }

    const fetchData = async () => {
      setLoading(true);
      setProgress(0);
      setRunMissing(false);

      // Prefer the pinned run, but fall back to latest so a pruned or
      // not-yet-published run still renders something useful.
      let path = resultsPath(directory, runId);
      let data = await getData(path, setProgress);
      let missing = false;
      if (!data && runId) {
        missing = true;
        path = resultsPath(directory);
        data = await getData(path, setProgress);
      }

      setRunMissing(missing);
      setData(data || {});
      setTimestamp(await getTimestamp(path));
      setProgress(100);
      setLoading(false);
    };
    fetchData();
  }, [directory, runId]);

  useEffect(() => {
    getRunIndex(directory).then(setRuns);
  }, [directory]);

  // Baseline/trend report for the run on screen (latest when ?run= fell back).
  const shownRunId = runMissing ? null : runId;
  const { report, reload } = useRunHistory(loading ? '' : directory, shownRunId);
  const trend = useTrend(directory);
  const [baselineBusy, setBaselineBusy] = useState(false);
  const [baselineError, setBaselineError] = useState('');
  const accept = async (keys) => {
    if (!report?.runId) return;
    setBaselineBusy(true);
    setBaselineError('');
    try {
      await acceptBaseline(directory, report.runId, keys);
      reload();
    } catch (e) {
      setBaselineError(String(e.message || e));
    } finally {
      setBaselineBusy(false);
    }
  };
  const reset = async () => {
    if (!window.confirm(`Clear the accepted baseline for ${directory}? Runs will be compared to the previous run again.`)) return;
    await resetBaseline(directory).catch(() => {});
    reload();
  };

  const selectRun = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set(RUN_QUERY_PARAM, id);
    else next.delete(RUN_QUERY_PARAM);
    setSearchParams(next);
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

  return (
    <div className={`${isDarkMode ? 'bg-black' : 'bg-white'} min-h-screen`}>
      <Header
        isDarkMode={isDarkMode}
        handleThemeToggle={handleThemeToggle}
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
      />
      {loading ? (
        <div
          className={`flex flex-col items-center justify-center gap-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
          style={{ height: 'calc(100vh - 48px)' }}
        >
          <div className="text-sm font-medium">Loading snapshots… {progress}%</div>
          <div className={`w-64 h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          {runs.length > 0 && (
            <div className={`flex items-center gap-2 border-b px-4 py-1.5 text-sm ${isDarkMode ? 'border-gray-800 text-gray-300' : 'border-gray-200 text-gray-600'}`}>
              <label htmlFor="run-picker" className="font-medium">Run</label>
              <select
                id="run-picker"
                className="select select-bordered select-xs"
                value={runMissing ? '' : (runId || '')}
                onChange={(e) => selectRun(e.target.value)}
              >
                <option value="">Latest</option>
                {runs.map((r) => (
                  <option key={r.runId} value={r.runId}>
                    {r.timestamp ? new Date(r.timestamp).toLocaleString() : r.runId} · {r.runId}
                  </option>
                ))}
              </select>
            </div>
          )}
          {runMissing && (
            <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
              Run <code>{runId}</code> has no saved copy — showing the latest results instead.
              It was either pruned (datasets keep the newest 3 runs, up to 7 days; quick and Figma
              runs 24 hours) or finished before per-run history was enabled.
            </div>
          )}
          {report && report.state !== 'error' && (
            <div className={`flex flex-wrap items-center gap-3 border-b px-4 py-1.5 text-xs ${isDarkMode ? 'border-gray-700 bg-gray-900 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
              {report.state === 'pending' ? (
                <span>Scoring this run against the baseline… (large datasets take a few minutes)</span>
              ) : (
                <>
                  <span className="font-semibold">
                    vs {report.baselineSize ? `baseline (${report.baselineSize} pages)` : report.previousRunId ? `previous run #${report.previousRunId}` : 'nothing yet (first scored run)'}:
                  </span>
                  <span className="text-amber-600">{report.counts.changed} changed</span>
                  <span className="text-sky-600">{report.counts.new} new</span>
                  {report.counts.missing > 0 && <span className="text-rose-600" title={report.missing.join(', ')}>{report.counts.missing} missing</span>}
                  <span className="text-emerald-600">{report.counts.unchanged} same</span>
                  {report.counts.flaky > 0 && <span title="Diff % keeps jumping between runs">{report.counts.flaky} flaky</span>}
                  {trend?.runs?.length > 1 && (
                    <span className="flex items-center gap-1 text-indigo-500">
                      <Sparkline
                        values={trend.runs.map((r) => r.avgDiffPct)}
                        title={`Average diff % over the last ${trend.runs.length} runs`}
                      />
                      avg {trend.runs[trend.runs.length - 1].avgDiffPct}%
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={baselineBusy}
                    onClick={() => accept()}
                    className="ml-auto rounded border border-indigo-400 px-2 py-0.5 font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 dark:hover:bg-indigo-950"
                    title="Every page of this run becomes the expected state; later runs are compared to it"
                  >
                    {baselineBusy ? 'Saving…' : 'Accept run as baseline'}
                  </button>
                  {report.baselineSize > 0 && (
                    <button type="button" onClick={reset} className="hover:underline">Reset baseline</button>
                  )}
                  {baselineError && <span className="text-rose-600">{baselineError}</span>}
                </>
              )}
            </div>
          )}
          <ImageDiff
            data={data}
            timestamp={timestamp}
            isDarkMode={isDarkMode}
            history={report?.state === 'ready' ? report : null}
            onAcceptBaseline={accept}
          />
        </>
      )}
    </div>
  );
};

export default ImageDiffPage;
