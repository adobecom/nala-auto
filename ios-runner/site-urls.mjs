// Expand a site into the list of URLs to screenshot on iOS.
//
// The real source of truth is nala/features/visual/sot.<site>.yml. When this
// runs inside the milo checkout that file is present and we scrape its URLs;
// otherwise we fall back to a single example URL so the pipeline stays runnable.
// Prints a JSON array to stdout (consumed by run.mjs via LAB_URLS).
//
// Usage: node site-urls.mjs <site> <milo_libs>
import { readFile } from 'node:fs/promises';

const site = process.argv[2] || 'bacom';
const milolibs = process.argv[3] || '';

function extractUrls(text) {
  const urls = new Set();
  for (const m of text.matchAll(/https?:\/\/[^\s'"]+/g)) urls.add(m[0]);
  return [...urls];
}

let urls = [];
try {
  urls = extractUrls(await readFile(`nala/features/visual/sot.${site}.yml`, 'utf8'));
} catch { /* config not in this checkout — use fallback */ }

if (!urls.length) {
  // TODO: replace with your real per-site URL list.
  urls = [`https://main--${site}--adobecom.aem.page/`];
}

if (milolibs) {
  const q = milolibs.replace(/^\?/, '');
  urls = urls.map((u) => u + (u.includes('?') ? `&${q}` : `?${q}`));
}

process.stdout.write(JSON.stringify(urls));
