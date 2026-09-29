import { useEffect, useState } from 'react';

export const bcReportBase = (runId) => `/api/milo/screenshots/bc-agent/runs/${encodeURIComponent(runId)}`;

export const runState = (run) => {
  if (!run) return null;
  if (!run.done) return 'running';
  return run.conclusion || run.status;
};

export const STATE_STYLE = {
  success: { dot: 'bg-emerald-500', label: 'Passed' },
  pass: { dot: 'bg-emerald-500', label: 'Passed' },
  review: { dot: 'bg-amber-500', label: 'Needs review' },
  failure: { dot: 'bg-rose-500', label: 'Failed' },
  error: { dot: 'bg-rose-500', label: 'Error' },
  cancelled: { dot: 'bg-gray-400', label: 'Cancelled' },
  running: { dot: 'bg-sky-500 animate-pulse', label: 'Running' },
};

export const styleFor = (state) => STATE_STYLE[state] || { dot: 'bg-gray-400', label: state || 'Unknown' };

export const timeAgo = (timestamp) => {
  if (!timestamp) return '';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

// Where "View results" should go for a run: the published report, never the GitHub run.
export const resultsHref = (run) => {
  if (!run?.done) return null;
  if (run.runKind === 'bc') return `${bcReportBase(run.runId)}/report.html`;
  return run.resultsUrl || null;
};

export const useLabRuns = (intervalMs = 20000) => {
  const [runs, setRuns] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/lab/runs', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Run service unavailable (${response.status})`);
        const data = await response.json();
        if (!cancelled && Array.isArray(data)) {
          setRuns(data);
          setError('');
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    load();
    const timer = window.setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return { runs, loaded, error };
};

export const useBcSummary = (run) => {
  const [summary, setSummary] = useState(null);
  const runId = run?.done ? run.runId : null;
  useEffect(() => {
    setSummary(null);
    if (!runId) return undefined;
    let cancelled = false;
    fetch(`${bcReportBase(runId)}/workflow-summary.json`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (!cancelled && data?.status) setSummary(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [runId]);
  return summary;
};
