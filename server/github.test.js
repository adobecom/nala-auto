import test from 'node:test';
import assert from 'node:assert/strict';
import { pickRun } from './github.js';

const t0 = Date.parse('2026-10-01T18:00:00Z');
const at = (s) => new Date(t0 + s * 1000).toISOString();

test('pickRun matches the run tagged with our id even when a newer run exists', () => {
  const runs = [
    { id: 3, created_at: at(4), display_title: 'Screenshot Diff [bbbb2222]' },
    { id: 2, created_at: at(2), display_title: 'Screenshot Diff [aaaa1111]' },
  ];
  assert.equal(pickRun(runs, t0, 'aaaa1111').id, 2);
  assert.equal(pickRun(runs, t0, 'bbbb2222').id, 3);
  assert.equal(pickRun(runs, t0, 'cccc3333'), null);
});

test('pickRun falls back to the oldest unclaimed untagged run', () => {
  const runs = [
    { id: 3, created_at: at(4), display_title: 'Screenshot Diff (Parallel Matrix)' },
    { id: 2, created_at: at(2), display_title: 'Screenshot Diff (Parallel Matrix)' },
    { id: 1, created_at: at(-60), display_title: 'Screenshot Diff (Parallel Matrix)' },
  ];
  assert.equal(pickRun(runs, t0, 'x').id, 2);
  assert.equal(pickRun(runs, t0, 'x', (id) => id === 2).id, 3);
});
