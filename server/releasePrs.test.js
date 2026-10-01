import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIncludedPrs, summarizeChecks, signoffs, isSignoff } from './releasePrs.js';

test('parseIncludedPrs extracts unique PR numbers for the repo only', () => {
  const body = `## Included
- https://github.com/adobecom/milo/pull/6801
- https://github.com/adobecom/milo/pull/6802
- https://github.com/adobecom/milo/pull/6801
- https://github.com/other/repo/pull/9`;
  assert.deepEqual(parseIncludedPrs(body, 'adobecom', 'milo'), [6801, 6802]);
  assert.deepEqual(parseIncludedPrs(null, 'adobecom', 'milo'), []);
});

test('summarizeChecks buckets runs and statuses, newest per name wins', () => {
  const s = summarizeChecks([
    { name: 'eslint', status: 'completed', conclusion: 'success', completed_at: '2026-01-01T00:00:00Z' },
    { name: 'tests', status: 'completed', conclusion: 'failure', completed_at: '2026-01-01T00:00:00Z' },
    { name: 'tests', status: 'completed', conclusion: 'success', completed_at: '2026-01-02T00:00:00Z' },
    { name: 'MAS', status: 'in_progress', started_at: '2026-01-02T00:00:00Z' },
    { name: 'skip', status: 'completed', conclusion: 'skipped' },
  ], [{ context: 'cla', state: 'failure', updated_at: '2026-01-01T00:00:00Z' }]);
  assert.equal(s.total, 5);
  assert.deepEqual(s.counts, { passed: 3, failed: 1, pending: 1, cancelled: 0 });
  assert.equal(s.overall, 'failed');
  assert.equal(s.failed[0].name, 'cla');
  assert.equal(s.pending[0].name, 'MAS');
});

test('summarizeChecks overall reflects pending and empty', () => {
  assert.equal(summarizeChecks([{ name: 'a', status: 'queued' }]).overall, 'pending');
  assert.equal(summarizeChecks([]).overall, 'none');
});

test('signoffs splits signed and missing SOT labels', () => {
  assert.equal(isSignoff('MIQ SOT👌'), true);
  assert.equal(isSignoff('needs-review'), false);
  const r = signoffs(['CC SOT 👌', 'ready'], ['BAcom SOT 👌', 'CC SOT 👌']);
  assert.deepEqual(r, { signed: ['CC SOT 👌'], missing: ['BAcom SOT 👌'] });
});
