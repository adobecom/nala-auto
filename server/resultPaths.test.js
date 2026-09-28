import test from 'node:test';
import assert from 'node:assert/strict';
import { resultsPath, resultsUrl, RUN_QUERY_PARAM } from './resultPaths.js';

test('latest results keep the existing unversioned path and URL', () => {
  assert.equal(resultsPath('bacom'), 'bacom');
  assert.equal(resultsUrl('http://nala-auto.corp.adobe.com', 'bacom'), 'http://nala-auto.corp.adobe.com/imagediff/bacom');
});

test('a run id pins the path and URL to one immutable run', () => {
  assert.equal(resultsPath('bacom', 'ab12cd34'), 'bacom/runs/ab12cd34');
  assert.equal(
    resultsUrl('http://nala-auto.corp.adobe.com', 'bacom', 'ab12cd34'),
    `http://nala-auto.corp.adobe.com/imagediff/bacom?${RUN_QUERY_PARAM}=ab12cd34`,
  );
});

test('site and run id are URL-encoded and a trailing slash on the base is dropped', () => {
  assert.equal(resultsPath('figma-a b'), 'figma-a%20b');
  assert.equal(resultsUrl('http://host/', 'a b', 'r/1'), 'http://host/imagediff/a%20b?run=r%2F1');
});
