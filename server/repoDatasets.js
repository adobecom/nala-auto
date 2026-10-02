// Which screenshot-diff datasets cover which code repo. Lets a release card
// (or any repo's own CI, via POST /lab/repo-runs) kick off the visual diff
// for "its" pages without knowing dataset names. Defaults cover Milo and the
// release-panel consumer repos; edits from the Releases page persist to
// server/.repo-datasets.json and are shared by everyone.
/* global process */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSiteName } from './customSites.js';

const STATE_FILE = process.env.REPO_DATASETS_FILE
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '.repo-datasets.json');

export const DEFAULT_REPO_DATASETS = {
  'adobecom/milo': ['milo'],
  'adobecom/da-express-milo': ['express'],
  'adobecom/da-cc': ['cc'],
  'adobecom/da-bacom': ['bacom', 'bacom-blog'],
  'adobecom/da-dc': ['dc'],
};

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export const normalizeRepo = (raw) => {
  const repo = String(raw || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '');
  return REPO_RE.test(repo) ? repo.toLowerCase() : null;
};

let overrides = {};
try {
  const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  if (data && typeof data === 'object' && !Array.isArray(data)) overrides = data;
} catch { /* nothing saved yet */ }

function persist() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(overrides, null, 2));
  } catch { /* best effort */ }
}

export function repoDatasets() {
  const merged = {};
  Object.entries(DEFAULT_REPO_DATASETS).forEach(([k, v]) => { merged[k.toLowerCase()] = [...v]; });
  Object.entries(overrides).forEach(([k, v]) => {
    if (Array.isArray(v) && v.length) merged[k] = [...v];
    else delete merged[k];
  });
  return merged;
}

export function datasetsForRepo(repo) {
  const id = normalizeRepo(repo);
  return id ? repoDatasets()[id] || [] : [];
}

// Empty list removes the mapping (including a default one).
export function setRepoDatasets(repo, datasets) {
  const id = normalizeRepo(repo);
  if (!id) return null;
  const list = [...new Set((Array.isArray(datasets) ? datasets : String(datasets || '').split(/[\s,]+/))
    .map(normalizeSiteName).filter(Boolean))];
  overrides[id] = list;
  persist();
  return list;
}

export const __test = {
  reset() { overrides = {}; },
};
