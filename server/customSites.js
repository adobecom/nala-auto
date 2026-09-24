// User-added datasets ("sites"), persisted server-side so everyone sees them
// (not just the browser that added it) and they survive backend restarts —
// mirrors the run-state persistence pattern in runner.js.
//
// Adding a site here only adds it to the menu + Run Console picker. It still
// needs to be *run* (▶ Run Console) before there is anything to view — this
// module only tracks the name, not any run results.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STATE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.custom-sites.json');

export const normalizeSiteName = (raw) =>
  (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

let sites = [];
try {
  const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  if (Array.isArray(data)) sites = data;
} catch { /* no persisted file yet, or unreadable — start empty */ }

function persist() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(sites));
  } catch { /* best effort — persistence must never break a request */ }
}

export function getCustomSites() {
  return [...sites];
}

// Returns the normalized name on success, or null if the input was empty /
// invalid after normalization.
export function addCustomSite(rawName) {
  const name = normalizeSiteName(rawName);
  if (!name) return null;
  if (!sites.includes(name)) {
    sites.push(name);
    persist();
  }
  return name;
}

export function removeCustomSite(rawName) {
  const name = normalizeSiteName(rawName);
  sites = sites.filter((s) => s !== name);
  persist();
}
