// Shared helpers for user-added screenshot-diff datasets ("sites").
//
// A dataset is just a site name that goes through the *same* pipeline as any
// built-in site (bacom, dc, cc, ...): the baseline URL list lives at
//   https://milo.adobe.com/drafts/nala/screenshotdiff/data/{site}.json
// (source-managed at the SharePoint folder
//   .../Shared Documents/milo/drafts/nala/screenshotdiff/data)
// but that file is just the *input* (which pages to compare) — running the
// screenshot-diff workflow against it (via ▶ Run Console) is what produces
// the actual diff results, published to
//   /api/milo/screenshots/{site}/results.json
// which is what ImageDiffPage fetches. Adding a dataset here only adds a menu
// entry + Run Console shortcut — you still need to run it once before there
// is anything to view.
//
// Datasets added via the "+ Add dataset" button on the Home page are
// persisted server-side (server/customSites.js, backed by
// server/.custom-sites.json) so they're shared across everyone and survive
// backend restarts — not just saved in one browser's localStorage.

export const CUSTOM_DATASETS_EVENT = 'nala-custom-datasets-changed';

export const normalizeDatasetName = (raw) =>
  (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export async function fetchCustomDatasets() {
  try {
    const res = await fetch('/lab/sites', { cache: 'no-store' });
    if (!res.ok) return [];
    const { sites } = await res.json();
    return Array.isArray(sites) ? sites : [];
  } catch {
    return [];
  }
}

function notifyChanged() {
  window.dispatchEvent(new Event(CUSTOM_DATASETS_EVENT));
}

// Returns the normalized name on success, or null if the input was empty /
// invalid, or the server rejected it.
export async function addCustomDataset(rawName) {
  const name = normalizeDatasetName(rawName);
  if (!name) return null;
  try {
    const res = await fetch('/lab/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    notifyChanged();
    return name;
  } catch {
    return null;
  }
}

export async function removeCustomDataset(name) {
  try {
    await fetch(`/lab/sites/${encodeURIComponent(name)}`, { method: 'DELETE' });
  } finally {
    notifyChanged();
  }
}
