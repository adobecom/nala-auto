// Client for the baseline/trend API (server/visualHistory.js). Snapshot ids
// (`<category>--<index>`) match the keys the server scores.
import { useCallback, useEffect, useState } from 'react';

const SAFE = /^[\w.-]{1,80}$/;

export const STATUS_STYLE = {
  changed: { label: 'changed', cls: 'bg-amber-100 text-amber-700' },
  new: { label: 'new', cls: 'bg-sky-100 text-sky-700' },
  unchanged: { label: 'same', cls: 'bg-emerald-100 text-emerald-700' },
  error: { label: 'error', cls: 'bg-rose-100 text-rose-700' },
};

/** Report of one run vs baseline/previous; polls while the server scores it. */
export function useRunHistory(site, runId) {
  const [report, setReport] = useState(null);
  const [tick, setTick] = useState(0);
  const enabled = SAFE.test(site || '') && !(site || '').includes('..');

  useEffect(() => {
    if (!enabled) {
      setReport(null);
      return undefined;
    }
    let alive = true;
    let timer;
    const load = async () => {
      try {
        const qs = new URLSearchParams({ site });
        if (runId) qs.set('run', runId);
        const res = await fetch(`/lab/history/run?${qs}`, { cache: 'no-store' });
        const body = await res.json();
        if (!alive) return;
        setReport(res.ok ? body : { state: 'error', error: body.error });
        if (res.ok && body.state === 'pending') timer = setTimeout(load, 10000);
      } catch (e) {
        if (alive) setReport({ state: 'error', error: String(e.message || e) });
      }
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [site, runId, enabled, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { report, reload };
}

export function useTrend(site) {
  const [trend, setTrend] = useState(null);
  useEffect(() => {
    if (!SAFE.test(site || '')) return undefined;
    let alive = true;
    fetch(`/lab/history/trend?site=${encodeURIComponent(site)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => { if (alive) setTrend(t); })
      .catch(() => {});
    return () => { alive = false; };
  }, [site]);
  return trend;
}

export async function acceptBaseline(site, runId, keys) {
  const res = await fetch('/lab/history/baseline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site, runId, keys }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

export async function resetBaseline(site) {
  const res = await fetch('/lab/history/baseline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site, reset: true }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
