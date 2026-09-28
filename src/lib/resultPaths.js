// Mirror of server/resultPaths.js — keep the two in sync.
//
// Milo publishes each completed run twice: an immutable per-run copy under
// `<site>/runs/<runId>/` and a "latest" alias at `<site>/`. `/imagediff/<site>`
// still means latest; `?run=<runId>` pins the viewer to one run.
//
// Published results are pruned upstream (datasets keep the newest 3 runs for up
// to 7 days; one-off quick/figma runs last 24h), so a versioned path can 404 —
// callers fall back to latest rather than showing nothing.
export const RUN_QUERY_PARAM = 'run';

export function resultsPath(site, runId) {
  const base = encodeURIComponent(site);
  return runId ? `${base}/runs/${encodeURIComponent(runId)}` : base;
}
