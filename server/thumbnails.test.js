import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeScreenshotPath, clampWidth, cacheKey, __test } from './thumbnails.js';

test('accepts published screenshot paths', () => {
  assert.equal(isSafeScreenshotPath('screenshots/bacom/homepage-chrome-a.png'), true);
  assert.equal(isSafeScreenshotPath('screenshots/run-12/a b/x.JPEG'), true);
  assert.equal(isSafeScreenshotPath('screenshots/x/y.webp'), true);
});

test('rejects traversal, absolute paths and non-images', () => {
  for (const bad of [
    '../../etc/passwd',
    'screenshots/../../etc/passwd.png',
    '/screenshots/a.png',
    'screenshots\\a.png',
    'drafts/nala/secret.png',
    'screenshots/bacom/results.json',
    'screenshots/bacom/a.png.exe',
    '',
    null,
    42,
  ]) {
    assert.equal(isSafeScreenshotPath(bad), false, `expected ${String(bad)} to be rejected`);
  }
});

test('rejects absurdly long paths', () => {
  assert.equal(isSafeScreenshotPath(`screenshots/${'a'.repeat(600)}.png`), false);
});

test('clamps width into a bounded range so the cache cannot be blown up', () => {
  assert.equal(clampWidth('96'), 96);
  assert.equal(clampWidth('1'), __test.MIN_WIDTH);
  assert.equal(clampWidth('99999'), __test.MAX_WIDTH);
  assert.equal(clampWidth(undefined), __test.DEFAULT_WIDTH);
  assert.equal(clampWidth('abc'), __test.DEFAULT_WIDTH);
});

test('cache key varies by path and width and is filesystem-safe', () => {
  const a = cacheKey('screenshots/x/a.png', 96);
  const b = cacheKey('screenshots/x/b.png', 96);
  const c = cacheKey('screenshots/x/a.png', 192);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[a-f0-9]{64}\.webp$/);
});
