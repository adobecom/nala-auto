/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.REPO_DATASETS_FILE = path.join(os.tmpdir(), `repo-datasets-${process.pid}.json`);
const mod = await import('./repoDatasets.js');

test('defaults map milo and consumer repos', () => {
  mod.__test.reset();
  assert.deepEqual(mod.datasetsForRepo('adobecom/milo'), ['milo']);
  assert.deepEqual(mod.datasetsForRepo('https://github.com/adobecom/da-bacom.git'), ['bacom', 'bacom-blog']);
  assert.deepEqual(mod.datasetsForRepo('nope'), []);
});

test('overrides add, replace and remove mappings', () => {
  mod.__test.reset();
  assert.deepEqual(mod.setRepoDatasets('Adobecom/New-Repo', 'Foo, bar foo'), ['foo', 'bar']);
  assert.deepEqual(mod.datasetsForRepo('adobecom/new-repo'), ['foo', 'bar']);
  mod.setRepoDatasets('adobecom/milo', []);
  assert.equal(mod.repoDatasets()['adobecom/milo'], undefined);
  assert.equal(mod.setRepoDatasets('bad', ['x']), null);
});
