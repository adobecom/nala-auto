// Result location contract shared by the run store and the console.
//
// Milo publishes each completed run twice:
//   - immutable, per-run:  screenshots/<site>/runs/<runId>/results.json
//   - "latest" alias:      screenshots/<site>/results.json   (overwritten each run)
//
// So a dataset keeps every output instead of only the most recent one. The
// viewer route is unchanged — `/imagediff/<site>` still means "latest", and
// `?run=<runId>` pins it to one immutable run.
export const RUN_QUERY_PARAM = 'run';

// Path under the screenshots bucket that holds a run's published artifacts.
// Omit runId for the "latest" alias.
export function resultsPath(site, runId) {
  const base = `${encodeURIComponent(site)}`;
  return runId ? `${base}/runs/${encodeURIComponent(runId)}` : base;
}

// Viewer link. Versioned when runId is given, latest otherwise.
export function resultsUrl(base, site, runId) {
  const url = `${String(base || '').replace(/\/$/, '')}/imagediff/${encodeURIComponent(site)}`;
  return runId ? `${url}?${RUN_QUERY_PARAM}=${encodeURIComponent(runId)}` : url;
}
