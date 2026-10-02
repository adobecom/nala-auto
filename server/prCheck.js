// PR check: paste a GitHub PR link, get the visual checks that cover it.
// Reads the PR (branch, changed files, body), derives the milolibs / preview
// branch, plans the affected-only runs (PR test URLs, dataset pages of changed
// blocks, mapped datasets for shared code, Brand Concierge agent), starts them
// through the normal runner and aggregates their results into one verdict.
/* global process */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { QUICK_MAX_URLS } from './runner.js';

const STATE_FILE = process.env.PR_CHECKS_FILE
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '.pr-checks.json');
const KEEP = 50;
const PAGES_PER_BLOCK = 5;
// Blocks whose test pages live in a dedicated dataset rather than under the
// block's name (brand-concierge pages are product/fragment URLs in `uar`).
const BLOCK_DATASETS = [[/^brand-concierge/, 'uar']];
const datasetForBlock = (block) => BLOCK_DATASETS.find(([re]) => re.test(block))?.[1];
export const QUICK_VIEWPORTS = ['chrome', 'iphone'];
// A/B diff above this (or a height jump) needs a human look.
export const REVIEW_DIFF_PCT = 1;
export const REVIEW_HEIGHT_PX = 40;

// ── PR parsing ──────────────────────────────────────────────────────────────

export function parsePrUrl(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)(?:\/pull\/|#)(\d+)(?:[/?#].*)?$/i);
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null;
}

// AEM turns a branch name into a host label: lowercase, non [a-z0-9] -> '-'.
export const branchSlug = (ref) => String(ref || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function prContext(pr) {
  const owner = pr.base?.repo?.owner?.login || '';
  const repo = pr.base?.repo?.name || '';
  const headOwner = pr.head?.repo?.owner?.login || owner;
  const headRepo = pr.head?.repo?.name || repo;
  const slug = branchSlug(pr.head?.ref);
  const isMilo = repo.toLowerCase() === 'milo';
  const fork = headOwner.toLowerCase() !== owner.toLowerCase();
  return {
    owner,
    repo,
    number: pr.number,
    title: pr.title || '',
    author: pr.user?.login || '',
    state: pr.merged_at ? 'merged' : pr.state || '',
    htmlUrl: pr.html_url || '',
    branch: pr.head?.ref || '',
    headOwner,
    headSha: pr.head?.sha || '',
    isMilo,
    milolibs: isMilo && slug ? `?milolibs=${slug}${fork ? `--milo--${headOwner.toLowerCase()}` : ''}` : '',
    mainHost: `main--${repo}--${owner}.aem.page`.toLowerCase(),
    branchHost: slug ? `${slug}--${headRepo}--${headOwner}.aem.page`.toLowerCase() : '',
  };
}

const PAGE_HOST = /(\.aem\.(page|live)|\.hlx\.(page|live)|(^|\.)adobe\.com)$/i;
const NOT_PAGE_HOST = /(corp\.adobe\.com|jira|wiki|git|slack|figma)/i;

function cleanUrl(raw) {
  try {
    const u = new URL(raw.replace(/[).,;:'"\]>]+$/, ''));
    if (!PAGE_HOST.test(u.hostname) || NOT_PAGE_HOST.test(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

const withoutMilolibs = (u) => {
  const c = new URL(u.href);
  c.searchParams.delete('milolibs');
  return c.href;
};

const sameHost = (u, host) => u.hostname.replace(/\.aem\.live$/, '.aem.page') === host;

// One quick-run line for a page: "A | B" or a single URL (B = A + milolibs).
export function lineFor(raw, ctx) {
  const u = typeof raw === 'string' ? cleanUrl(raw) : raw;
  if (!u) return null;
  const rest = `${u.pathname}${u.search}${u.hash}`;
  if (ctx.branchHost && sameHost(u, ctx.branchHost)) return `https://${ctx.mainHost}${rest} | ${u.href}`;
  if (ctx.isMilo) return withoutMilolibs(u);
  if (!ctx.branchHost) return null;
  return `https://${ctx.mainHost}${rest} | https://${ctx.branchHost}${rest}`;
}

// Test URLs in a PR body -> quick-run lines. "Before: x" / "After: y" pairs
// are compared directly; every other page URL goes through lineFor().
export function testLines(body, ctx) {
  const text = String(body || '').replace(/<!--[\s\S]*?-->/g, '');
  const lines = [];
  const used = new Set();
  const urlsIn = (s) => (s.match(/https?:\/\/[^\s)<>"'\]]+/g) || []).map(cleanUrl).filter(Boolean);
  const rows = text.split(/\r?\n/);
  rows.forEach((row, i) => {
    if (!/\bbefore\b/i.test(row)) return;
    const before = urlsIn(row)[0];
    const afterRow = rows.slice(i + 1, i + 4).find((r) => /\bafter\b/i.test(r) && urlsIn(r).length);
    const after = afterRow && urlsIn(afterRow)[0];
    if (before && after) {
      lines.push(`${before.href} | ${after.href}`);
      used.add(before.href);
      used.add(after.href);
    }
  });
  urlsIn(text).forEach((u) => {
    if (used.has(u.href)) return;
    used.add(u.href);
    const line = lineFor(u, ctx);
    if (line && !lines.includes(line)) lines.push(line);
  });
  return lines;
}

// ── Changed files ───────────────────────────────────────────────────────────

const NON_VISUAL = /(^|\/)(test|tests|nala|tools|\.github|\.husky|docs)\/|\.(md|txt|json|yml|yaml|lock)$|^(package|\.eslintrc|\.stylelintrc)/i;
const BLOCK = /(?:^|\/)blocks\/([^/]+)\//;

export function classifyFiles(files) {
  const names = files.map((f) => (typeof f === 'string' ? f : f.filename)).filter(Boolean);
  const blocks = [];
  const shared = [];
  let bc = false;
  names.forEach((f) => {
    if (/brand-concierge/i.test(f)) bc = true;
    if (NON_VISUAL.test(f)) return;
    const m = f.match(BLOCK);
    if (m) {
      if (!blocks.includes(m[1])) blocks.push(m[1]);
    } else if (/\.(js|mjs|css|html)$/i.test(f)) {
      shared.push(f);
    }
  });
  return { files: names.length, blocks, shared, bc };
}

// ── Plan ────────────────────────────────────────────────────────────────────

const pageMatches = (page, block) => {
  const name = block.toLowerCase();
  if (String(page.key || '').toLowerCase().includes(name)) return true;
  try {
    return new URL(page.a).pathname.toLowerCase().split('/').some((seg) => seg.includes(name));
  } catch {
    return false;
  }
};

/**
 * @param ctx      prContext()
 * @param files    PR files (strings or {filename})
 * @param body     PR body
 * @param datasets names mapped to the repo (Releases page mapping)
 * @param pagesOf  name -> dataset pages (listDatasetPages)
 */
export function planCheck({ ctx, files, body, datasets, pagesOf, extraDatasets = [] }) {
  const changes = classifyFiles(files);
  const notes = [];
  const test = testLines(body, ctx).slice(0, QUICK_MAX_URLS);
  if (!test.length) notes.push('No test URLs found in the PR description.');

  const blockPages = [];
  const uncovered = [];
  // Repo datasets first, then any other dataset that has pages for the block
  // (e.g. `uar` holds the brand-concierge pages for Milo).
  // The dataset with the most matching pages "covers" the block; one stray
  // match elsewhere (a bacom product page) does not pull in a whole site.
  const searchOrder = [...datasets, ...Object.keys(pagesOf).filter((d) => !datasets.includes(d))];
  const coveringSet = new Set();
  changes.blocks.forEach((block) => {
    const mapped = datasetForBlock(block);
    if (mapped && (pagesOf[mapped] || []).length) {
      coveringSet.add(mapped);
      const own = pagesOf[mapped].filter((p) => pageMatches(p, block));
      (own.length ? own : pagesOf[mapped]).slice(0, PAGES_PER_BLOCK)
        .forEach((p) => blockPages.push({ block, dataset: mapped, key: p.key, url: p.a }));
      return;
    }
    const matches = searchOrder.map((ds) => ({ ds, pages: (pagesOf[ds] || []).filter((p) => pageMatches(p, block)) }))
      .filter((m) => m.pages.length)
      .sort((x, y) => y.pages.length - x.pages.length);
    if (!matches.length) {
      uncovered.push(block);
      return;
    }
    coveringSet.add(matches[0].ds);
    const hits = matches.flatMap((m) => m.pages.map((p) => ({ block, dataset: m.ds, key: p.key, url: p.a })));
    blockPages.push(...hits.slice(0, PAGES_PER_BLOCK));
  });
  const blockLines = [];
  blockPages.forEach((p) => {
    const line = lineFor(p.url, ctx);
    if (line && !blockLines.includes(line) && !test.includes(line) && blockLines.length < QUICK_MAX_URLS) blockLines.push(line);
  });

  if (ctx.isMilo && !ctx.milolibs) notes.push('Could not derive milolibs from the PR branch.');
  if (!ctx.isMilo && !ctx.branchHost) notes.push('Could not derive the branch preview host.');

  let bcUrl = null;
  if (changes.bc) {
    const sides = test.map((l) => l.split('|').map((s) => s.trim()));
    const pick = sides.find((s) => s.some((u) => /concierge|\/bc/i.test(u))) || sides[0];
    if (pick) {
      bcUrl = pick.length > 1 ? pick[1] : `${pick[0]}${ctx.milolibs ? `${pick[0].includes('?') ? '&' : '?'}${ctx.milolibs.slice(1)}` : ''}`;
    } else {
      notes.push('Brand Concierge files changed but no test URL to run the BC agent on.');
    }
  }

  const available = Boolean(ctx.isMilo && ctx.milolibs);
  const covering = [...coveringSet];
  const names = [...datasets, ...covering.filter((d) => !datasets.includes(d))];
  const suggested = !available ? [] : names.filter((d) => covering.includes(d)
    || (changes.shared.length > 0 && datasets.includes(d)));

  return {
    changes,
    milolibs: ctx.milolibs,
    testUrls: { lines: test, recommended: test.length > 0 },
    blocks: {
      pages: blockPages,
      lines: blockLines,
      uncovered,
      // Skip the quick run when every matched page is already in a suggested full dataset.
      recommended: blockLines.length > 0 && blockPages.some((p) => !suggested.includes(p.dataset)),
    },
    datasets: {
      names,
      // Milo code ships to every consumer site: their datasets are opt-in extras.
      extra: ctx.isMilo ? extraDatasets.filter((d) => !names.includes(d)) : [],
      covering,
      suggested,
      available,
      recommended: suggested.length > 0,
      reason: !ctx.isMilo
        ? 'full datasets swap Milo libs (milolibs), so they cannot load a consumer-repo branch'
        : [
          covering.length && `${covering.join(', ')} cover${covering.length === 1 ? 's' : ''} the changed blocks`,
          changes.shared.length ? `${changes.shared.length} shared file${changes.shared.length === 1 ? '' : 's'} changed` : 'only block files changed',
        ].filter(Boolean).join('; '),
    },
    bc: { url: bcUrl, recommended: Boolean(bcUrl) },
    notes,
  };
}

// ── GitHub ──────────────────────────────────────────────────────────────────

export async function fetchPr(ref, ghGet) {
  const base = `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;
  const pr = await ghGet(base);
  const files = [];
  for (let page = 1; page <= 3; page += 1) {
    const batch = await ghGet(`${base}/files?per_page=100&page=${page}`);
    files.push(...batch.map((f) => f.filename));
    if (batch.length < 100) break;
  }
  return { pr, files };
}

export async function buildPlan(url, {
  ghGet, datasetsForRepo, listDatasetPages, allDatasets = () => [], searchDatasets = allDatasets,
}) {
  const ref = parsePrUrl(url);
  if (!ref) throw Object.assign(new Error('Enter a GitHub PR link like https://github.com/adobecom/milo/pull/1234'), { status: 400 });
  const { pr, files } = await fetchPr(ref, ghGet);
  const ctx = prContext(pr);
  const datasets = datasetsForRepo(`${ctx.owner}/${ctx.repo}`);
  const changes = classifyFiles(files);
  const pagesOf = {};
  if (changes.blocks.length) {
    const all = [...new Set([...datasets, ...searchDatasets()])];
    await Promise.all(all.map(async (ds) => { pagesOf[ds] = await listDatasetPages(ds); }));
  }
  return { pr: ctx, plan: planCheck({ ctx, files, body: pr.body, datasets, pagesOf, extraDatasets: allDatasets() }) };
}

// ── Store ───────────────────────────────────────────────────────────────────

let checks = [];
try {
  const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  if (Array.isArray(data)) checks = data;
} catch { /* nothing saved yet */ }

function persist() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(checks.slice(0, KEEP)));
  } catch { /* best effort */ }
}

export const listChecks = () => checks.map((c) => ({
  id: c.id, createdAt: c.createdAt, pr: c.pr, runs: c.runs.length,
}));
export const getCheck = (id) => checks.find((c) => c.id === id) || null;

/**
 * Start the selected runs. `pick` = { testUrls, blocks, bc: bool, datasets: [names] };
 * anything omitted falls back to the plan's recommendation.
 */
export function startCheck({ pr, plan }, pick = {}, { createRun }) {
  const want = (k) => (pick[k] === undefined ? plan[k].recommended : Boolean(pick[k]));
  const datasets = Array.isArray(pick.datasets)
    ? pick.datasets.filter((d) => plan.datasets.names.includes(d) || plan.datasets.extra.includes(d))
    : plan.datasets.suggested || (plan.datasets.recommended ? plan.datasets.names : []);
  const runs = [];
  const errors = [];
  const start = (role, label, body) => {
    try {
      const run = createRun(body);
      runs.push({ role, label, runId: run.id, site: run.site });
    } catch (e) {
      errors.push({ role, label, error: String(e.message || e) });
    }
  };
  const milolibs = pr.isMilo ? pr.milolibs : '';
  if (want('testUrls') && plan.testUrls.lines.length) {
    start('test-urls', 'PR test URLs', { kind: 'quick', urls: plan.testUrls.lines.join('\n'), viewports: QUICK_VIEWPORTS, milolibs });
  }
  if (want('blocks') && plan.blocks.lines.length) {
    start('blocks', 'Changed blocks', { kind: 'quick', urls: plan.blocks.lines.join('\n'), viewports: QUICK_VIEWPORTS, milolibs });
  }
  if (plan.datasets.available) {
    datasets.forEach((site) => start('dataset', `Dataset ${site}`, { site, milolibs: pr.milolibs }));
  }
  if (want('bc') && plan.bc.url) start('bc', 'Brand Concierge agent', { kind: 'bc', url: plan.bc.url });
  if (!runs.length && !errors.length) {
    throw Object.assign(new Error('Nothing to run for this PR — no test URLs, covered blocks or datasets selected.'), { status: 400 });
  }
  const check = {
    id: randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
    pr,
    plan,
    runs,
    errors,
  };
  checks.unshift(check);
  checks = checks.slice(0, KEEP);
  persist();
  return check;
}

// ── Summary ─────────────────────────────────────────────────────────────────

const RANK = { fail: 4, running: 3, review: 2, pass: 1 };
export const worst = (verdicts) => verdicts.filter(Boolean)
  .reduce((acc, v) => ((RANK[v] || 0) > (RANK[acc] || 0) ? v : acc), 'pass');

const flagged = (e) => Boolean(e.error)
  || (e.diffPct ?? 0) > REVIEW_DIFF_PCT
  || Math.abs(e.heightDelta ?? 0) > REVIEW_HEIGHT_PX;

const top = (list) => list.sort((x, y) => (y.diffPct ?? 0) - (x.diffPct ?? 0)).slice(0, 10);

async function scoreRun(snap, ref, history) {
  if (snap.mode !== 'live') return { verdict: 'pass', note: 'mock run — no screenshots' };
  if (ref.role === 'bc') return { verdict: null, note: 'see the BC report' };
  const metrics = await history.getMetrics(snap.site, snap.runId);
  if (ref.role === 'dataset') {
    const report = await history.runReport(snap.site, snap.runId);
    if (report.state === 'pending') return { verdict: 'running', note: 'scoring screenshots' };
    if (report.state !== 'ready') return { verdict: 'review', note: report.error || 'could not score this run' };
    const pages = Object.entries(report.entries)
      .filter(([, e]) => (e.status === 'changed' && !e.flaky) || e.status === 'error')
      .map(([key, e]) => ({ key, status: e.status, diffPct: e.diffPct, refDiffPct: e.refDiffPct, urls: metrics?.entries?.[key]?.urls || '' }));
    return {
      verdict: pages.length ? 'review' : 'pass',
      counts: report.counts,
      pages: top(pages),
      note: pages.length ? `${pages.length} page(s) differ from baseline` : 'matches baseline',
    };
  }
  if (!metrics) {
    if (history.failureFor(snap.site, snap.runId) && !history.isComputing(snap.site, snap.runId)) {
      return { verdict: 'review', note: history.failureFor(snap.site, snap.runId) };
    }
    history.ensureMetrics(snap.site, snap.runId).catch(() => {});
    return { verdict: 'running', note: 'scoring screenshots' };
  }
  const entries = Object.entries(metrics.entries || {});
  const pages = entries.filter(([, e]) => flagged(e))
    .map(([key, e]) => ({ key, diffPct: e.diffPct ?? null, heightDelta: e.heightDelta ?? null, error: e.error || null, urls: e.urls || '' }));
  return {
    verdict: pages.length ? 'review' : 'pass',
    counts: { pages: entries.length, flagged: pages.length },
    pages: top(pages),
    note: pages.length ? `${pages.length} of ${entries.length} differ > ${REVIEW_DIFF_PCT}%` : `${entries.length} page(s) look the same`,
  };
}

export async function summarize(check, { getRun, history }) {
  const runs = await Promise.all(check.runs.map(async (ref) => {
    const snap = getRun(ref.runId)?.snapshot();
    if (!snap) return { ...ref, status: 'gone', verdict: 'review', note: 'run no longer tracked' };
    const base = {
      ...ref,
      runKind: snap.runKind,
      mode: snap.mode,
      status: snap.status,
      conclusion: snap.conclusion,
      done: snap.done,
      htmlUrl: snap.htmlUrl,
      resultsUrl: snap.resultsUrl,
      urls: snap.urls,
      startedAt: snap.startedAt,
    };
    if (!snap.done) return { ...base, verdict: 'running' };
    if (snap.conclusion !== 'success') return { ...base, verdict: 'fail', note: snap.note || `run ${snap.conclusion}` };
    try {
      return { ...base, ...(await scoreRun(snap, ref, history)) };
    } catch (e) {
      return { ...base, verdict: 'review', note: String(e.message || e) };
    }
  }));
  return {
    ...check,
    runs,
    verdict: worst([...runs.map((r) => r.verdict), check.errors?.length ? 'review' : null]),
  };
}

export const __test = { reset: () => { checks = []; } };
