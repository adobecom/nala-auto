import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRows, extractRows, inspectDataset, __test } from './datasets.js';

const rows = [
  { key: '__config__', waitStrategy: 'scroll' },
  { key: 'home', a: 'https://a.com/' },
  { key: 'pair', a: 'https://a.com/x', b: 'https://b.com/x' },
  { key: 'promo', a: 'https://a.com/p', mask: '.promo; #marketo', waitStrategy: 'networkidle' },
  { key: 'skip', a: 'https://a.com/s', ignore: 'yes' },
  { key: 'bad', a: 'not-a-url' },
  { key: '', a: 'https://a.com/nokey' },
];

test('summarizeRows mirrors the workflow loader', () => {
  const s = summarizeRows(rows);
  assert.equal(s.waitStrategy, 'scroll');
  assert.equal(s.pages, 4);
  assert.equal(s.ignored, 1);
  assert.equal(s.invalid, 1);
  assert.equal(s.pairMode, 1);
  assert.equal(s.withOptions, 1);
  assert.deepEqual(s.sample[2], { key: 'promo', a: 'https://a.com/p', waitStrategy: 'networkidle', mask: ['.promo', '#marketo'] });
});

test('extractRows reads the first sheet of a multi-sheet workbook', () => {
  assert.deepEqual(extractRows({ ':type': 'multi-sheet', ':names': ['s1'], s1: { data: [1] } }), [1]);
  assert.deepEqual(extractRows({ data: [2] }), [2]);
  assert.deepEqual(extractRows(null), []);
});

const fakeFetch = (map) => async (url) => {
  const hit = map[url];
  if (!hit) return { ok: false, status: 404 };
  return { ok: true, status: 200, json: async () => hit };
};

test('inspectDataset reports published, previewed-only and missing sheets', async () => {
  __test.cache.clear();
  const ok = await inspectDataset('ok', { fetchImpl: fakeFetch({ 'https://milo.adobe.com/drafts/nala/screenshotdiff/data/ok.json': { data: rows } }) });
  assert.equal(ok.exists, true);
  assert.equal(ok.pages, 4);

  const prev = await inspectDataset('prev', { fetchImpl: fakeFetch({ 'https://main--milo--adobecom.aem.page/drafts/nala/screenshotdiff/data/prev.json': { data: rows } }) });
  assert.equal(prev.exists, false);
  assert.equal(prev.previewed, true);
  assert.match(prev.message, /not published/);

  const none = await inspectDataset('none', { fetchImpl: fakeFetch({}) });
  assert.equal(none.exists, false);
  assert.match(none.message, /No sheet/);

  const empty = await inspectDataset('empty', { fetchImpl: fakeFetch({ 'https://milo.adobe.com/drafts/nala/screenshotdiff/data/empty.json': { data: [] } }) });
  assert.equal(empty.exists, false);
});
