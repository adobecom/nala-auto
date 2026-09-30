import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, normalizeJob, runnerDisplayName } from './runnerStatus.js';

const NOW = Date.parse('2025-01-02T12:00:00Z');
const job = (over) => normalizeJob({
  id: Math.floor(Math.random() * 1e9),
  run_id: 1,
  name: 'test',
  workflow_name: 'Screenshot Diff',
  status: 'completed',
  conclusion: 'success',
  labels: ['self-hosted', 'macOS', 'screendiff'],
  html_url: 'https://github.com/x/y/actions/runs/1/job/2',
  created_at: '2025-01-02T10:00:00Z',
  started_at: '2025-01-02T10:00:10Z',
  completed_at: '2025-01-02T10:05:00Z',
  ...over,
});

test('job history alone: busy vs seen, last job, failures, queued', () => {
  const jobs = [
    job({ runner_name: 'MacNode02', status: 'in_progress', conclusion: null, completed_at: null, started_at: '2025-01-02T11:50:00Z' }),
    job({ runner_name: 'MacNode02', conclusion: 'failure' }),
    job({ runner_name: 'MacNode12', completed_at: '2025-01-02T11:00:00Z' }),
    job({ runner_name: 'MacNode12', completed_at: '2025-01-02T09:00:00Z' }),
    job({ runner_name: null, status: 'queued', conclusion: null, started_at: null, completed_at: null }),
    job({ runner_name: 'GitHub Actions 3', labels: ['ubuntu-latest'] }),
  ];
  const out = summarize({ runners: null, runnersError: '403: nope', jobs, now: NOW });
  assert.equal(out.source, 'job-history');
  assert.equal(out.runnersError, '403: nope');
  assert.deepEqual(out.runners.map((r) => [r.name, r.status]), [['MacNode02', 'busy'], ['MacNode12', 'seen']]);
  const node02 = out.runners[0];
  assert.equal(node02.failures, 1);
  assert.equal(node02.current.status, 'in_progress');
  assert.deepEqual(node02.labels, ['macOS', 'screendiff']);
  assert.equal(out.runners[1].jobs, 2);
  assert.equal(out.runners[1].last.completedAt, '2025-01-02T11:00:00Z');
  assert.equal(out.totals.queued, 1);
  assert.equal(out.totals.busy, 1);
  assert.ok(out.recent.every((j) => j.labels.includes('self-hosted')));
});

test('runners API: offline/idle/busy and runners with no history', () => {
  const runners = [
    { name: 'MacNode20', os: 'macOS', status: 'offline', busy: false, labels: [{ name: 'self-hosted' }] },
    { name: 'MacNode02', os: 'macOS', status: 'online', busy: true, labels: [{ name: 'self-hosted' }, { name: 'ios-sim' }] },
    { name: 'MacNode12', os: 'macOS', status: 'online', busy: false, labels: [] },
  ];
  const out = summarize({ runners, runnersError: null, jobs: [job({ runner_name: 'MacNode12' })], now: NOW });
  assert.equal(out.source, 'runners-api');
  assert.deepEqual(out.runners.map((r) => [r.name, r.status]), [
    ['MacNode02', 'busy'], ['MacNode12', 'idle'], ['MacNode20', 'offline'],
  ]);
  assert.deepEqual(out.runners[0].labels, ['ios-sim']);
  assert.equal(out.runners[1].jobs, 1);
  assert.deepEqual(out.totals, { runners: 3, busy: 1, idle: 1, offline: 1, seen: 0, quiet: 0, queued: 0 });
});

test('jobs completed before the window do not count toward totals', () => {
  const out = summarize({
    runners: null,
    jobs: [job({ runner_name: 'MacNode02', completed_at: '2024-12-30T00:00:00Z', conclusion: 'failure' })],
    now: NOW,
  });
  assert.equal(out.runners[0].jobs, 0);
  assert.equal(out.runners[0].failures, 0);
  assert.equal(out.runners[0].last.conclusion, 'failure');
  assert.equal(out.runners[0].status, 'quiet');
  assert.equal(out.runners[0].lastSeen, '2024-12-30T00:00:00Z');
  assert.equal(out.totals.quiet, 1);
});

test('sj* hostnames display by their MacNode label or alias', () => {
  assert.equal(runnerDisplayName('sj1010122072235', ['self-hosted', 'macnode07'], {}), 'MacNode07');
  assert.equal(runnerDisplayName('sj1010122072235', ['self-hosted'], {}), 'sj1010122072235');
  assert.equal(runnerDisplayName('MacNode01', ['MacNode01'], {}), 'MacNode01');
  assert.equal(runnerDisplayName('sj1010122072235', [], { sj1010122072235: 'MacNode99' }), 'MacNode99');
  const view = summarize({
    runners: [{ name: 'sj1010122072226', status: 'online', busy: false, labels: [{ name: 'self-hosted' }, { name: 'MacNode26' }] }],
    jobs: [],
  });
  assert.equal(view.runners[0].name, 'MacNode26');
  assert.equal(view.runners[0].host, 'sj1010122072226');
});
