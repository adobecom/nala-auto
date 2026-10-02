/* global process, Buffer */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'nala-history-'));
process.env.HISTORY_DIR = DIR;
const h = await import('./visualHistory.js');

const entry = (hash, diffPct, extra = {}) => ({ a: `screenshots/s/runs/x/${hash}-a.png`, hashA: hash, hashB: `${hash}b`, diffPct, heightDelta: 0, ...extra });
async function putMetrics(site, runId, timestamp, entries) {
  const file = path.join(DIR, site, 'metrics', `${runId}.json`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ site, runId, timestamp, entries }));
}

test('diffRaw counts differing pixels and extra rows', () => {
  const a = Buffer.from([0, 0, 0, 0, 0, 0]);
  const b = Buffer.from([0, 0, 0, 255, 255, 255]);
  assert.equal(h.diffRaw(a, 1, b, 1, 2, 3), 50);
  assert.equal(h.diffRaw(a, 1, a, 1, 2, 3), 0);
  assert.equal(h.diffRaw(a, 1, Buffer.concat([a, a]), 2, 2, 3), 50);
});

test('classify and isFlaky', () => {
  assert.equal(h.classify(entry('x', 1), null), 'new');
  assert.equal(h.classify({ error: 'boom' }, null), 'error');
  assert.equal(h.classify(entry('x', 1), entry('x', 9)), 'unchanged');
  assert.equal(h.classify(entry('y', 1.2), entry('x', 1)), 'unchanged');
  assert.equal(h.classify(entry('y', 5), entry('x', 1)), 'changed');
  assert.equal(h.isFlaky([1, 8, 1, 8]), true);
  assert.equal(h.isFlaky([1, 1, 8, 8]), false);
  assert.equal(h.isFlaky([1, 8]), false);
});

test('flattenResults keys entries by category and index', () => {
  const flat = h.flattenResults({ home: [{ a: 'a1', b: 'b1' }, { a: 'a2' }], x: 'skip' });
  assert.deepEqual(Object.keys(flat), ['home--0']);
});

test('runReport compares to previous run, then to accepted baseline', async () => {
  await putMetrics('s', 'r1', '2024-01-01', { p1: entry('a', 1), p2: entry('b', 2), gone: entry('g', 0) });
  await putMetrics('s', 'r2', '2024-01-02', { p1: entry('a', 1), p2: entry('c', 9), p3: entry('d', 0) });

  let r = await h.runReport('s', 'r2');
  assert.equal(r.state, 'ready');
  assert.equal(r.previousRunId, 'r1');
  assert.equal(r.entries.p1.status, 'unchanged');
  assert.equal(r.entries.p2.status, 'changed');
  assert.equal(r.entries.p2.refKind, 'previous');
  assert.equal(r.entries.p3.status, 'new');
  assert.deepEqual(r.missing, ['gone']);

  assert.deepEqual(await h.acceptBaseline('s', 'r2', ['p2']), { accepted: 1, size: 1 });
  r = await h.runReport('s', 'r2');
  assert.equal(r.entries.p2.status, 'unchanged');
  assert.equal(r.entries.p2.refKind, 'baseline');
  assert.equal(r.baselineSize, 1);

  const sum = await h.runSummary('s', 'r2');
  assert.equal(sum.state, 'ready');
  assert.equal(sum.counts.new, 1);

  assert.deepEqual(await h.resetBaseline('s'), { size: 0 });
  await assert.rejects(h.acceptBaseline('s', 'nope'), /not computed/);
});

test('trend and judgments', async () => {
  const t = await h.trend('s');
  assert.deepEqual(t.runs.map((r) => r.runId), ['r1', 'r2']);
  assert.deepEqual(t.series.p2, [2, 9]);
  assert.equal(await h.recordJudgment('screenshots/s/runs/r2/c-a.png', { verdict: 'pass', confidence: 0.9 }), true);
  assert.equal(await h.recordJudgment('../etc/passwd', { verdict: 'pass' }), false);
  assert.equal(h.isSafeName('../x'), false);
});

test.after(() => fs.rm(DIR, { recursive: true, force: true }));
