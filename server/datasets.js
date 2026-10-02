// Dataset (page list) inspection: what the screenshot-diff workflow will load
// for a site. Mirrors tools/screenshot-diff/lib/load-data.js in the milo fork:
// the published sheet https://milo.adobe.com/drafts/nala/screenshotdiff/data/<site>.json
// with columns key | a | b | waitStrategy | mask | ignore and an optional
// `__config__` row. Used to validate "+ Add dataset" and to preview a dataset
// in the Run Console before dispatching.
/* global process */

export const DATA_BASE = process.env.SCREENSHOT_DATA_BASE_URL || 'https://milo.adobe.com';
export const PREVIEW_BASE = process.env.SCREENSHOT_DATA_PREVIEW_URL || 'https://main--milo--adobecom.aem.page';
export const DATA_PREFIX = '/drafts/nala/screenshotdiff/data';
const CACHE_MS = 60 * 1000;
const SAMPLE = 5;

const cache = new Map();

export const datasetUrl = (name, base = DATA_BASE) => `${base}${DATA_PREFIX}/${name}.json`;

export function extractRows(json) {
  if (json && json[':type'] === 'multi-sheet') {
    const sheet = json[(json[':names'] || [])[0]];
    return sheet && Array.isArray(sheet.data) ? sheet.data : [];
  }
  return json && Array.isArray(json.data) ? json.data : [];
}

function col(row, name) {
  const key = Object.keys(row || {}).find((k) => k.trim().toLowerCase() === name);
  const value = key === undefined ? '' : row[key];
  return value === null || value === undefined ? '' : String(value).trim();
}

const isTruthy = (v) => /^(y|yes|true|x|1)$/i.test(v || '');
const splitSelectors = (v) => String(v || '').split(/[\n;]+/).map((s) => s.trim()).filter(Boolean);

// Sheet rows -> the pages the workflow will run, plus skip counts.
export function pagesFromRows(rows) {
  let waitStrategy = '';
  const pages = [];
  let ignored = 0;
  let invalid = 0;
  rows.forEach((row) => {
    const key = col(row, 'key');
    if (!key) return;
    if (key === '__config__') {
      waitStrategy = col(row, 'waitstrategy') || waitStrategy;
      return;
    }
    if (isTruthy(col(row, 'ignore'))) {
      ignored += 1;
      return;
    }
    const a = col(row, 'a') || col(row, 'url');
    const b = col(row, 'b');
    if (!a && !b) return;
    if (![a, b].filter(Boolean).every((u) => /^https?:\/\/\S+$/i.test(u))) invalid += 1;
    const page = { key, a };
    if (b) page.b = b;
    const ws = col(row, 'waitstrategy');
    if (ws) page.waitStrategy = ws;
    const mask = splitSelectors(col(row, 'mask'));
    if (mask.length) page.mask = mask;
    pages.push(page);
  });
  return { waitStrategy, pages, ignored, invalid };
}

// Sheet rows -> summary of what will actually run.
export function summarizeRows(rows) {
  const { waitStrategy, pages, ignored, invalid } = pagesFromRows(rows);
  return {
    waitStrategy: waitStrategy || 'default',
    pages: pages.length,
    ignored,
    invalid,
    pairMode: pages.filter((p) => p.b).length,
    withOptions: pages.filter((p) => p.waitStrategy || p.mask).length,
    sample: pages.slice(0, SAMPLE),
  };
}

async function fetchStatus(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { status: res.status };
    try {
      return { status: res.status, json: await res.json() };
    } catch {
      return { status: res.status, error: 'invalid JSON' };
    }
  } catch (e) {
    return { status: 0, error: String(e.message || e) };
  }
}

// { name, url, exists, published, previewed, status, message, ...summary }
export async function inspectDataset(name, { force = false, fetchImpl = fetch } = {}) {
  const hit = cache.get(name);
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const url = datasetUrl(name);
  const live = await fetchStatus(url, fetchImpl);
  let value;
  if (live.json) {
    const summary = summarizeRows(extractRows(live.json));
    value = {
      name,
      url,
      exists: true,
      published: true,
      status: live.status,
      ...summary,
      message: summary.pages
        ? `${summary.pages} page${summary.pages === 1 ? '' : 's'} will run`
        : 'Sheet is published but has no usable rows (needs key + a columns).',
    };
    if (!summary.pages) value.exists = false;
  } else {
    const preview = await fetchStatus(datasetUrl(name, PREVIEW_BASE), fetchImpl);
    const previewed = Boolean(preview.json);
    let message;
    if (previewed) {
      message = 'Sheet is previewed but not published. Publish it in Sidekick (or POST admin.hlx.page/live) so the workflow can read it.';
    } else if (live.status === 404) {
      message = `No sheet at ${url}. Create ${name}.xlsx in the SharePoint data folder, then preview + publish it.`;
    } else {
      message = `Could not read ${url} (${live.error || `HTTP ${live.status}`}).`;
    }
    value = {
      name, url, exists: false, published: false, previewed, status: live.status, pages: 0, sample: [], message,
    };
  }
  cache.set(name, { at: Date.now(), value });
  return value;
}

// Every runnable page of a published dataset ([] when it can't be read).
export async function listDatasetPages(name, { fetchImpl = fetch } = {}) {
  const live = await fetchStatus(datasetUrl(name), fetchImpl);
  return live.json ? pagesFromRows(extractRows(live.json)).pages : [];
}

export const __test = { cache };
