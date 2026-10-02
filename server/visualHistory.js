// Visual history: per-run diff metrics, accepted baselines and trends for the
// screenshot-diff datasets.
//
// Milo's workflow publishes each run's screenshots under
// screenshots/<site>/runs/<runId>/ but S3 only keeps the newest few runs, and
// results.json carries image paths, not scores. So when a run finishes we pull
// its screenshots once, score every A/B pair, and keep the small JSON result
// here (forever — it's a few KB per run) so trends survive S3 pruning.
//
// Layout under HISTORY_DIR (default server/.history):
//   <site>/metrics/<runId>.json   { site, runId, timestamp, computedAt, entries }
//   <site>/baseline.json          { updatedAt, entries: { key: {...metric, runId, acceptedAt} } }
//   <site>/judgments.json         { "<a image path>": { verdict, confidence, reasoning, at } }
//
// An entry key is `<category>--<index>` — the same id the viewer gives each
// snapshot, so the UI can join without any mapping.
/* global process, Buffer */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { S3_HOST } from './thumbnails.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.HISTORY_DIR || path.join(HERE, '.history');

// Pixels are compared on a downscaled copy: plenty to score a whole page and
// ~16x cheaper than full resolution.
export const COMPARE_WIDTH = 400;
// Per-channel delta below which a pixel counts as equal (anti-aliasing noise).
export const PIXEL_THRESHOLD = 24;
// A page whose diff % moves by no more than this between runs is "unchanged".
export const DIFF_TOLERANCE = 0.5;
export const HEIGHT_TOLERANCE = 40;
const PAIR_CONCURRENCY = 4;

const SAFE_NAME = /^[\w.-]{1,80}$/;
export const isSafeName = (s) => typeof s === 'string' && SAFE_NAME.test(s) && !s.includes('..');

const siteDir = (site) => path.join(DIR, site);
const metricsFile = (site, runId) => path.join(siteDir(site), 'metrics', `${runId}.json`);
const baselineFile = (site) => path.join(siteDir(site), 'baseline.json');
const judgmentsFile = (site) => path.join(siteDir(site), 'judgments.json');

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value));
  await fs.rename(tmp, file);
}

const s3Url = (rel) => `${S3_HOST}/${rel.split('/').map(encodeURIComponent).join('/')}`;

async function fetchBuffer(rel) {
  const res = await fetch(s3Url(rel));
  if (!res.ok) throw new Error(`${rel}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchJson(rel) {
  const res = await fetch(s3Url(rel), { cache: 'no-store' });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ── Pure scoring helpers ────────────────────────────────────────────────────

/**
 * Percentage of differing pixels between two raw RGB(A) buffers of equal width.
 * Rows that exist in only one image count as fully different, so a page that
 * grew or lost a section scores accordingly.
 */
export function diffRaw(a, hA, b, hB, width, channels, threshold = PIXEL_THRESHOLD) {
  const h = Math.min(hA, hB);
  const maxH = Math.max(hA, hB);
  if (!maxH || !width) return 0;
  let diff = 0;
  const rowLen = width * channels;
  for (let y = 0; y < h; y += 1) {
    const off = y * rowLen;
    for (let x = 0; x < rowLen; x += channels) {
      const i = off + x;
      if (
        Math.abs(a[i] - b[i]) > threshold
        || Math.abs(a[i + 1] - b[i + 1]) > threshold
        || Math.abs(a[i + 2] - b[i + 2]) > threshold
      ) diff += 1;
    }
  }
  diff += (maxH - h) * width;
  return Math.round((diff / (maxH * width)) * 10000) / 100;
}

const shortHash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

async function toRaw(buf) {
  const { data, info } = await sharp(buf, { limitInputPixels: false })
    .resize({ width: COMPARE_WIDTH })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, height: info.height, channels: info.channels };
}

export async function scorePair(bufA, bufB) {
  const [metaA, metaB] = await Promise.all([sharp(bufA).metadata(), sharp(bufB).metadata()]);
  const [rawA, rawB] = await Promise.all([toRaw(bufA), toRaw(bufB)]);
  return {
    hashA: shortHash(bufA),
    hashB: shortHash(bufB),
    heightA: metaA.height,
    heightB: metaB.height,
    heightDelta: (metaB.height || 0) - (metaA.height || 0),
    diffPct: diffRaw(rawA.data, rawA.height, rawB.data, rawB.height, COMPARE_WIDTH, rawA.channels),
  };
}

/** Flatten results.json into { key: { a, b, diff, urls } }. */
export function flattenResults(results) {
  const out = {};
  for (const [category, list] of Object.entries(results || {})) {
    if (!Array.isArray(list)) continue;
    list.forEach((item, i) => {
      if (item && item.a && item.b) {
        out[`${category}--${i}`] = { a: item.a, b: item.b, diff: item.diff || null, urls: item.urls || '' };
      }
    });
  }
  return out;
}

/**
 * Compare one entry against its reference (baseline or previous run).
 * Identical screenshots, or a diff % / height that barely moved, are unchanged.
 */
export function classify(entry, ref) {
  if (!entry || entry.error) return 'error';
  if (!ref) return 'new';
  if (entry.hashA === ref.hashA && entry.hashB === ref.hashB) return 'unchanged';
  const dPct = Math.abs((entry.diffPct ?? 0) - (ref.diffPct ?? 0));
  const dH = Math.abs((entry.heightDelta ?? 0) - (ref.heightDelta ?? 0));
  return dPct <= DIFF_TOLERANCE && dH <= HEIGHT_TOLERANCE ? 'unchanged' : 'changed';
}

/**
 * A page is flaky when its diff % keeps jumping between runs rather than
 * moving once (a real change) — e.g. rotating marketo/georouting content.
 */
export function isFlaky(series) {
  const vals = series.filter((v) => typeof v === 'number');
  if (vals.length < 3) return false;
  let flips = 0;
  for (let i = 1; i < vals.length; i += 1) {
    if (Math.abs(vals[i] - vals[i - 1]) > DIFF_TOLERANCE) flips += 1;
  }
  return flips >= 2 && flips / (vals.length - 1) >= 0.5;
}

/**
 * Per-entry status for `metrics` against `baseline` (preferred, per key) or
 * the previous run's metrics. `series` (key -> diff % history, oldest first)
 * marks flaky pages.
 */
export function compareRun(metrics, { baseline, previous, series = {}, judgments = {} } = {}) {
  const entries = {};
  const counts = { changed: 0, unchanged: 0, new: 0, missing: 0, error: 0, flaky: 0 };
  const base = baseline?.entries || {};
  const prev = previous?.entries || {};
  for (const [key, e] of Object.entries(metrics.entries || {})) {
    let ref = base[key];
    let refKind = 'baseline';
    if (!ref && prev[key]) {
      ref = { ...prev[key], runId: previous.runId };
      refKind = 'previous';
    }
    const status = classify(e, ref);
    const flaky = isFlaky(series[key] || []);
    counts[status] += 1;
    if (flaky) counts.flaky += 1;
    entries[key] = {
      status,
      flaky,
      diffPct: e.diffPct ?? null,
      heightDelta: e.heightDelta ?? null,
      refKind: ref ? refKind : null,
      refRunId: ref?.runId || null,
      refDiffPct: ref?.diffPct ?? null,
      judge: judgments[e.a] || null,
      error: e.error || null,
    };
  }
  const missing = [];
  const refKeys = new Set([...Object.keys(base), ...Object.keys(prev)]);
  for (const key of refKeys) {
    if (!metrics.entries?.[key]) missing.push(key);
  }
  counts.missing = missing.length;
  return { counts, entries, missing };
}

// ── Storage & computation ───────────────────────────────────────────────────

export const getMetrics = (site, runId) => readJson(metricsFile(site, runId));
export const getBaseline = async (site) => (await readJson(baselineFile(site))) || { entries: {} };
export const getJudgments = async (site) => (await readJson(judgmentsFile(site))) || {};

export async function listMetrics(site) {
  let files = [];
  try {
    files = await fs.readdir(path.join(siteDir(site), 'metrics'));
  } catch {
    return [];
  }
  const all = await Promise.all(
    files.filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(siteDir(site), 'metrics', f))),
  );
  return all.filter(Boolean).sort((x, y) => String(x.timestamp).localeCompare(String(y.timestamp)));
}

async function runIndex(site) {
  const list = await fetchJson(`screenshots/${site}/runs/index.json`);
  return Array.isArray(list) ? list.filter((e) => e && isSafeName(e.runId)) : [];
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

const inFlight = new Map();
const failures = new Map();
// One run at a time: a big dataset is hundreds of multi-MB PNGs.
let queue = Promise.resolve();

async function compute(site, runId) {
  const results = await fetchJson(`screenshots/${site}/runs/${runId}/results.json`);
  if (!results) throw new Error('results.json not published for this run');
  const idx = (await runIndex(site)).find((r) => r.runId === runId);
  const flat = flattenResults(results);
  const keys = Object.keys(flat);
  const scored = await mapLimit(keys, PAIR_CONCURRENCY, async (key) => {
    const item = flat[key];
    try {
      const [a, b] = await Promise.all([fetchBuffer(item.a), fetchBuffer(item.b)]);
      return [key, { ...item, ...(await scorePair(a, b)) }];
    } catch (e) {
      return [key, { ...item, error: String(e.message || e) }];
    }
  });
  const metrics = {
    site,
    runId,
    timestamp: idx?.timestamp || new Date().toISOString(),
    computedAt: new Date().toISOString(),
    entries: Object.fromEntries(scored),
  };
  await writeJson(metricsFile(site, runId), metrics);
  return metrics;
}

/** Compute (once) and cache metrics for a run. Concurrent callers share the job. */
export function ensureMetrics(site, runId) {
  if (!isSafeName(site) || !isSafeName(runId)) return Promise.reject(new Error('bad site/run'));
  const id = `${site}/${runId}`;
  if (!inFlight.has(id)) {
    const job = (queue = queue.catch(() => {}).then(async () => {
      const existing = await getMetrics(site, runId);
      return existing || compute(site, runId);
    }));
    job
      .then(() => failures.delete(id))
      .catch((e) => failures.set(id, String(e.message || e)))
      .finally(() => inFlight.delete(id));
    inFlight.set(id, job);
  }
  return inFlight.get(id);
}

export const isComputing = (site, runId) => inFlight.has(`${site}/${runId}`);
export const failureFor = (site, runId) => failures.get(`${site}/${runId}`) || null;

/** diff % series per key over the given metrics (oldest first). */
export function buildSeries(metricsList) {
  const series = {};
  metricsList.forEach((m, i) => {
    for (const [key, e] of Object.entries(m.entries || {})) {
      if (!series[key]) series[key] = new Array(metricsList.length).fill(null);
      series[key][i] = e.error ? null : e.diffPct ?? null;
    }
  });
  return series;
}

export const TREND_RUNS = 10;

/**
 * Status of one run vs baseline/previous. Returns { state: 'ready' | 'pending'
 * | 'error' }; pending kicks off computation in the background.
 */
export async function runReport(site, runIdArg) {
  let runId = runIdArg;
  if (!runId) {
    const idx = await runIndex(site);
    runId = idx.sort((x, y) => String(y.timestamp).localeCompare(String(x.timestamp)))[0]?.runId;
    if (!runId) return { state: 'error', error: 'no published runs for this dataset' };
  }
  if (!isSafeName(runId)) return { state: 'error', error: 'bad run id' };
  const metrics = await getMetrics(site, runId);
  if (!metrics) {
    const failed = failureFor(site, runId);
    if (failed && !isComputing(site, runId)) return { state: 'error', runId, error: failed };
    ensureMetrics(site, runId).catch(() => {});
    return { state: 'pending', runId };
  }
  const all = await listMetrics(site);
  const pos = all.findIndex((m) => m.runId === runId);
  const upto = pos >= 0 ? all.slice(0, pos + 1) : [...all, metrics];
  const window = upto.slice(-TREND_RUNS);
  const previous = pos > 0 ? all[pos - 1] : null;
  const [baseline, judgments] = await Promise.all([getBaseline(site), getJudgments(site)]);
  const series = buildSeries(window);
  const report = compareRun(metrics, { baseline, previous, series, judgments });
  return {
    state: 'ready',
    site,
    runId,
    timestamp: metrics.timestamp,
    previousRunId: previous?.runId || null,
    baselineSize: Object.keys(baseline.entries || {}).length,
    trendRuns: window.map((m) => ({ runId: m.runId, timestamp: m.timestamp })),
    series,
    ...report,
  };
}

/** Trend across the latest runs of a dataset. */
export async function trend(site, limit = TREND_RUNS) {
  const all = (await listMetrics(site)).slice(-Math.max(1, Math.min(50, limit)));
  const series = buildSeries(all);
  const flaky = Object.keys(series).filter((k) => isFlaky(series[k]));
  return {
    site,
    runs: all.map((m) => {
      const vals = Object.values(m.entries || {}).filter((e) => !e.error);
      const avg = vals.length ? vals.reduce((s, e) => s + (e.diffPct || 0), 0) / vals.length : 0;
      return { runId: m.runId, timestamp: m.timestamp, pages: vals.length, avgDiffPct: Math.round(avg * 100) / 100 };
    }),
    series,
    flaky,
  };
}

/** Accept a run's pages (all, or just `keys`) as the dataset baseline. */
export async function acceptBaseline(site, runId, keys) {
  const metrics = await getMetrics(site, runId);
  if (!metrics) throw Object.assign(new Error('metrics not computed for this run yet'), { status: 409 });
  const baseline = await getBaseline(site);
  const pick = Array.isArray(keys) && keys.length ? keys : Object.keys(metrics.entries);
  const at = new Date().toISOString();
  let accepted = 0;
  for (const key of pick) {
    const e = metrics.entries[key];
    if (!e || e.error) continue;
    baseline.entries[key] = {
      hashA: e.hashA, hashB: e.hashB, diffPct: e.diffPct, heightDelta: e.heightDelta, runId, acceptedAt: at,
    };
    accepted += 1;
  }
  baseline.updatedAt = at;
  await writeJson(baselineFile(site), baseline);
  return { accepted, size: Object.keys(baseline.entries).length };
}

export async function resetBaseline(site, keys) {
  const baseline = await getBaseline(site);
  if (Array.isArray(keys) && keys.length) keys.forEach((k) => delete baseline.entries[k]);
  else baseline.entries = {};
  baseline.updatedAt = new Date().toISOString();
  await writeJson(baselineFile(site), baseline);
  return { size: Object.keys(baseline.entries).length };
}

const RUN_IMAGE = /^screenshots\/([\w.-]+)\/runs\/([\w.-]+)\/[^/]+$/;

/** Remember an AI judge verdict for a per-run screenshot pair. */
export async function recordJudgment(aPath, result) {
  const m = RUN_IMAGE.exec(aPath || '');
  if (!m || !isSafeName(m[1]) || !result || result.error || !result.verdict) return false;
  const file = judgmentsFile(m[1]);
  const all = (await readJson(file)) || {};
  all[aPath] = {
    verdict: result.verdict,
    confidence: result.confidence ?? null,
    reasoning: result.reasoning || '',
    at: new Date().toISOString(),
  };
  await writeJson(file, all);
  return true;
}

/** Compact counts for the console's Recent runs (null when not computed). */
export async function runSummary(site, runId) {
  if (!isSafeName(site) || !isSafeName(runId)) return null;
  if (!(await getMetrics(site, runId))) {
    return isComputing(site, runId) ? { state: 'pending' } : null;
  }
  const r = await runReport(site, runId);
  return r.state === 'ready' ? { state: 'ready', counts: r.counts, previousRunId: r.previousRunId } : null;
}

/** Score any published-but-unscored runs of these datasets, one at a time. */
export async function backfill(sites) {
  for (const site of sites) {
    if (!isSafeName(site)) continue;
    const idx = await runIndex(site).catch(() => []);
    for (const r of idx) {
      if (!(await getMetrics(site, r.runId))) {
        await ensureMetrics(site, r.runId).catch(() => {});
      }
    }
  }
}

export const __test = { DIR };
