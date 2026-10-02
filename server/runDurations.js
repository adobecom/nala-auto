// How long each dataset's last run took, as a reference for planning runs.
// Keyed by run kind then site: { screenshot: { milo: { ms, at, runId, conclusion } } }.
// Only the latest finished run per dataset is kept; one-off kinds (quick,
// figma, bc) get a fresh site per run so they are not tracked.
/* global process */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = process.env.RUN_DURATIONS_FILE
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '.run-durations.json');
const TRACKED = new Set(['screenshot', 'ios']);
const COUNTED = new Set(['success', 'failure']);

let store = null;

function load() {
  if (store) return store;
  try {
    store = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
  } catch {
    store = {};
  }
  return store;
}

function save() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(store));
  } catch { /* best effort */ }
}

// Cancelled or errored runs stop early, so their time says nothing useful.
export function recordDuration({ kind, site, runId, startedAt, finishedAt, conclusion }) {
  if (!TRACKED.has(kind) || !site || !COUNTED.has(conclusion)) return false;
  const start = typeof startedAt === 'number' ? startedAt : Date.parse(startedAt);
  const end = typeof finishedAt === 'number' ? finishedAt : Date.parse(finishedAt);
  const ms = end - start;
  if (!Number.isFinite(ms) || ms <= 0) return false;
  const s = load();
  const prev = s[kind]?.[site];
  if (prev && Date.parse(prev.at) >= end) return false;
  s[kind] = { ...s[kind], [site]: { ms, at: new Date(end).toISOString(), runId, conclusion } };
  save();
  return true;
}

export function getDurations() {
  return load();
}

// Seed from runs reloaded at startup: finished runs without a finishedAt
// (recorded before this existed) take the GitHub run's own start/end times.
export async function backfillDurations(runs, getGhRun) {
  const s = load();
  for (const r of runs) {
    if (!r.done || !TRACKED.has(r.runKind) || s[r.runKind]?.[r.site]) continue;
    if (r.finishedAt) {
      recordDuration({ kind: r.runKind, site: r.site, runId: r.runId, startedAt: r.startedAt, finishedAt: r.finishedAt, conclusion: r.conclusion });
      continue;
    }
    if (!r.ghRunId || !getGhRun) continue;
    try {
      const gr = await getGhRun(r.ghRunId);
      if (gr?.status === 'completed') {
        recordDuration({
          kind: r.runKind, site: r.site, runId: r.runId,
          startedAt: gr.run_started_at || gr.created_at, finishedAt: gr.updated_at, conclusion: gr.conclusion,
        });
      }
    } catch { /* skip */ }
  }
}

export function resetDurationsForTest() {
  store = {};
}
