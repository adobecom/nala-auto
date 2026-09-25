/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.RUNS_STATE_FILE = path.join(os.tmpdir(), `nala-runs-test-${process.pid}.json`);
const { parseQuickUrls, inputsFor, QUICK_MAX_URLS } = await import('./runner.js');

test('parses plain URLs and A | B pairs, skipping blanks and comments', () => {
  assert.deepEqual(
    parseQuickUrls('https://a.com/x\n\n# note\n  https://a.com/y | https://b.com/y  \r\n'),
    ['https://a.com/x', 'https://a.com/y | https://b.com/y'],
  );
});

test('keeps commas inside URLs', () => {
  assert.deepEqual(parseQuickUrls('https://a.com/?ids=1,2,3'), ['https://a.com/?ids=1,2,3']);
});

test('rejects empty lists, non-http lines, triple pipes and oversized lists', () => {
  assert.throws(() => parseQuickUrls('  \n# only a comment'), /at least one URL/);
  assert.throws(() => parseQuickUrls('https://ok.com\nbusiness.adobe.com/x'), /Not a valid URL line/);
  assert.throws(() => parseQuickUrls('https://ok.com | javascript:alert(1)'), /Not a valid URL line/);
  assert.throws(() => parseQuickUrls('https://a.com | https://b.com | https://c.com'), /Not a valid URL line/);
  const many = Array.from({ length: QUICK_MAX_URLS + 1 }, (_, i) => `https://a.com/${i}`).join('\n');
  assert.throws(() => parseQuickUrls(many), /capped/);
});

test('quick runs dispatch as a one-off custom site with urls + viewports', () => {
  assert.deepEqual(
    inputsFor({
      kind: 'quick', site: 'quick-ab12cd34', milolibs: '?milolibs=stage',
      urls: ['https://a.com/x', 'https://a.com/y | https://b.com/y'], viewports: ['chrome', 'iphone'],
    }),
    {
      site: 'custom',
      custom_site: 'quick-ab12cd34',
      milo_libs: '?milolibs=stage',
      urls: 'https://a.com/x\nhttps://a.com/y | https://b.com/y',
      viewports: 'chrome,iphone',
    },
  );
});

test('dataset runs keep their original dispatch shape', () => {
  assert.deepEqual(inputsFor({ kind: 'screenshot', site: 'bacom', milolibs: '?milolibs=stage' }), {
    site: 'bacom', milo_libs: '?milolibs=stage',
  });
});
