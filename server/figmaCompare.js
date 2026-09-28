// Input validation for the Figma compare run kind.
//
// A Figma compare run pairs ONE live web page with ONE Figma node (a frame /
// component in a design or prototype link) and diffs only the DOM region named
// by a CSS selector. Everything here is pure validation so the console can
// reject a bad paste instantly and the runner never receives half a request.

// Figma links come in three shapes — /design (current), /file (legacy) and
// /proto (prototype). All of them carry the file key as the next path segment
// and the target frame as a `node-id` query param.
const FIGMA_PATH = /^\/(design|file|proto|board|slides)\/([A-Za-z0-9]{10,})(?:\/|$)/;

// Figma writes node ids as `1-23` in URLs and `1:23` in its API. Accept both.
const NODE_ID = /^\d+[-:]\d+$/;

export const SELECTOR_MAX = 200;

export function parseWebUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) throw new Error('Enter the web page URL to compare.');
  if (!/^https?:\/\/\S+$/i.test(url)) {
    throw new Error(`Not a valid web page URL: ${url}`);
  }
  return url;
}

// Returns { url, fileKey, nodeId } with nodeId normalised to Figma's `1:23`
// API form. The full URL is still forwarded to the runner so it can re-derive
// anything else it needs (branch, page-id, scaling params).
export function parseFigmaUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) throw new Error('Enter the Figma design or prototype URL.');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Not a valid Figma URL: ${value}`);
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Figma URL must start with https://');
  if (!/(^|\.)figma\.com$/i.test(url.hostname)) {
    throw new Error(`Not a figma.com URL: ${url.hostname}`);
  }
  const m = FIGMA_PATH.exec(url.pathname);
  if (!m) {
    throw new Error('Figma URL must contain a file key, e.g. https://www.figma.com/design/<fileKey>/…');
  }
  const nodeId = (url.searchParams.get('node-id') || '').trim();
  if (!nodeId) {
    throw new Error('Figma URL is missing node-id — open the frame in Figma and use "Copy link to selection".');
  }
  if (!NODE_ID.test(nodeId)) {
    throw new Error(`Not a valid Figma node-id: ${nodeId}`);
  }
  return { url: value, fileKey: m[2], nodeId: nodeId.replace('-', ':') };
}

// The selector names the DOM region on the web page that corresponds to the
// Figma node — the runner screenshots that element, not the whole page.
export function parseSelector(raw) {
  const selector = String(raw || '').trim();
  if (!selector) throw new Error('Enter a CSS selector for the matching page region.');
  if (/[\n\r]/.test(selector)) throw new Error('Selector must be a single line.');
  if (selector.length > SELECTOR_MAX) {
    throw new Error(`Selector is too long (max ${SELECTOR_MAX} characters).`);
  }
  return selector;
}

// Exactly one viewport: a Figma frame is drawn at one width, so comparing it
// against several viewports at once would diff against the wrong layout.
export function parseViewport(raw, allowed) {
  const picked = (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map((v) => String(v).trim());
  if (picked.length !== 1) throw new Error('Pick exactly one viewport for a Figma compare run.');
  if (!allowed.includes(picked[0])) throw new Error(`Unknown viewport: ${picked[0]}`);
  return picked[0];
}

// One place that validates a whole Figma compare request, so the HTTP layer and
// the run store agree on what a valid run looks like.
export function parseFigmaRun(body, allowedViewports) {
  return {
    webUrl: parseWebUrl(body.urls ?? body.url ?? body.webUrl),
    figma: parseFigmaUrl(body.figmaUrl ?? body.figma_url),
    selector: parseSelector(body.selector),
    viewport: parseViewport(body.viewports ?? body.viewport, allowedViewports),
  };
}
