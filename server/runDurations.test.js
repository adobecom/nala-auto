import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

process.env.RUN_DURATIONS_FILE = path.join(os.tmpdir(), `run-durations-${process.pid}.json`);
const d = await import('./runDurations.js');

test('recordDuration keeps the latest finished dataset run', () => {
  d.resetDurationsForTest();
  assert.equal(d.recordDuration({ kind: 'screenshot', site: 'milo', runId: 'a', startedAt: 0, finishedAt: 600000, conclusion: 'success' }), true);
  assert.equal(d.recordDuration({ kind: 'screenshot', site: 'milo', runId: 'b', startedAt: 700000, finishedAt: 1900000, conclusion: 'failure' }), true);
  assert.deepEqual(d.getDurations().screenshot.milo, { ms: 1200000, at: new Date(1900000).toISOString(), runId: 'b', conclusion: 'failure' });
  // An older run never overwrites a newer one.
  assert.equal(d.recordDuration({ kind: 'screenshot', site: 'milo', runId: 'c', startedAt: 0, finishedAt: 100000, conclusion: 'success' }), false);
});

test('recordDuration ignores cancelled runs and one-off kinds', () => {
  d.resetDurationsForTest();
  assert.equal(d.recordDuration({ kind: 'screenshot', site: 'uar', startedAt: 0, finishedAt: 5000, conclusion: 'cancelled' }), false);
  assert.equal(d.recordDuration({ kind: 'quick', site: 'quick-1', startedAt: 0, finishedAt: 5000, conclusion: 'success' }), false);
  assert.deepEqual(d.getDurations(), {});
});

test('backfillDurations uses GitHub run times for runs without finishedAt', async () => {
  d.resetDurationsForTest();
  const runs = [
    { runKind: 'screenshot', site: 'bacom', runId: 'x', done: true, ghRunId: 7, startedAt: 0, conclusion: 'success' },
    { runKind: 'screenshot', site: 'cc', runId: 'y', done: true, startedAt: 1000, finishedAt: 61000, conclusion: 'success' },
    { runKind: 'screenshot', site: 'dc', runId: 'z', done: false, ghRunId: 8 },
  ];
  const gh = async (id) => (id === 7 ? {
    status: 'completed', conclusion: 'success', run_started_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:25:00Z',
  } : null);
  await d.backfillDurations(runs, gh);
  const s = d.getDurations().screenshot;
  assert.equal(s.bacom.ms, 25 * 60000);
  assert.equal(s.cc.ms, 60000);
  assert.equal(s.dc, undefined);
});
