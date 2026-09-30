// Thumbnail service for the screenshot-diff viewer sidebar.
//
// Milo publishes full-page screenshots: 1600px wide and 5000-7400px tall,
// which is 1-2.2 MB of PNG each. The viewer's snapshot list renders one 48x40
// preview per snapshot, and a dataset like `bacom` has ~190 of them — so the
// sidebar alone used to pull hundreds of megabytes of full-size PNG just to
// paint postage stamps.
//
// This module downscales on the server instead: fetch the PNG from S3 once,
// crop/resize it to the exact box the sidebar renders, cache the result on
// disk, and serve a few KB of WebP with a long immutable cache lifetime. S3
// sends no Cache-Control of its own, so the browser would otherwise revalidate
// every screenshot on every visit.
//
// | Env var           | Default                | Meaning                        |
// | ----------------- | ---------------------- | ------------------------------ |
// | `THUMB_CACHE_DIR` | `server/.thumb-cache`  | Where rendered thumbs are kept |
// | `S3_HOST`         | `https://s3-sj3...`    | Screenshot origin              |
/* global process, Buffer */
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const S3_HOST = process.env.S3_HOST || 'https://s3-sj3.corp.adobe.com/milo';
const CACHE_DIR = process.env.THUMB_CACHE_DIR || path.join(HERE, '.thumb-cache');

// The sidebar tile is 48x40 CSS px; render at 2x so it stays sharp on retina.
const DEFAULT_WIDTH = 96;
const MIN_WIDTH = 16;
const MAX_WIDTH = 512;
// 48:40 — matches the sidebar tile so `object-cover object-top` in the browser
// is a no-op rather than a second crop.
const ASPECT = 40 / 48;

// A published screenshot at a given path never changes content (a new run
// publishes a new path, or overwrites `latest` — which the viewer reloads
// anyway), so thumbs are safe to cache hard.
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Screenshot paths come from results.json and are rendered into a URL, so they
 * are attacker-influenced in principle. Only allow the published screenshot
 * tree and reject anything that could escape it or reach a non-image.
 */
export function isSafeScreenshotPath(p) {
  if (typeof p !== 'string' || !p) return false;
  if (p.length > 512) return false;
  if (p.includes('..') || p.includes('\\') || p.startsWith('/')) return false;
  if (!p.startsWith('screenshots/')) return false;
  return /\.(png|jpe?g|webp)$/i.test(p);
}

export function clampWidth(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
}

export function cacheKey(screenshotPath, width) {
  const hash = createHash('sha256').update(`${screenshotPath}|${width}`).digest('hex');
  return `${hash}.webp`;
}

// Two sidebar tiles can request the same thumb at once (and a cold dataset
// requests ~190 at once). Share one fetch+resize per key instead of pulling
// the same multi-megabyte PNG concurrently.
const inFlight = new Map();

async function readCached(file) {
  try {
    return await fs.readFile(file);
  } catch {
    return null;
  }
}

async function render(screenshotPath, width) {
  const encoded = screenshotPath.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${S3_HOST}/${encoded}`);
  if (!res.ok) {
    const err = new Error(`upstream ${res.status}`);
    err.status = res.status === 404 || res.status === 403 ? 404 : 502;
    throw err;
  }
  const input = Buffer.from(await res.arrayBuffer());
  // `position: top` mirrors the viewer's `object-top`: a full-page screenshot
  // is mostly below the fold, and the top is what identifies the page.
  return sharp(input)
    .resize(width, Math.round(width * ASPECT), { fit: 'cover', position: 'top' })
    .webp({ quality: 72 })
    .toBuffer();
}

/**
 * Returns `{ body, etag }` for a cached-or-freshly-rendered thumbnail.
 * Throws an error carrying `.status` when the upstream screenshot is missing.
 */
export async function getThumbnail(screenshotPath, widthRaw) {
  const width = clampWidth(widthRaw);
  const key = cacheKey(screenshotPath, width);
  const file = path.join(CACHE_DIR, key);

  const cached = await readCached(file);
  if (cached) return { body: cached, etag: `"${key}"`, cached: true };

  if (!inFlight.has(key)) {
    const job = (async () => {
      const body = await render(screenshotPath, width);
      try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
        // Write to a unique temp name first so a crash mid-write can never
        // leave a truncated image in the cache for everyone else to serve.
        const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
        await fs.writeFile(tmp, body);
        await fs.rename(tmp, file);
      } catch {
        // A read-only or full disk should degrade to "slow", not "broken".
      }
      return body;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }

  return { body: await inFlight.get(key), etag: `"${key}"`, cached: false };
}

export const CACHE_CONTROL = `public, max-age=${MAX_AGE_SECONDS}, immutable`;

export const __test = { DEFAULT_WIDTH, MAX_WIDTH, MIN_WIDTH, ASPECT, CACHE_DIR, render };
