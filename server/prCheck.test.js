import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

process.env.PR_CHECKS_FILE = path.join(os.tmpdir(), `pr-checks-${process.pid}.json`);
process.env.RUNS_STATE_FILE = path.join(os.tmpdir(), `pr-runs-${process.pid}.json`);
const pc = await import('./prCheck.js');

const pr6872 = {
  number: 6872,
  title: 'BC global c2',
  html_url: 'https://github.com/adobecom/milo/pull/6872',
  state: 'open',
  user: { login: 'colloyd' },
  base: { repo: { name: 'milo', owner: { login: 'adobecom' } } },
  head: { ref: 'bc-c2-global', sha: 'abc', repo: { name: 'milo', owner: { login: 'adobecom' } } },
  body: [
    '<!-- https://ignored.adobe.com/x -->',
    'Resolves: [MWPW-1](https://jira.corp.adobe.com/browse/MWPW-1)',
    '**Test URLs:**',
    '- Before: https://stage--milo--adobecom.aem.page/drafts/bc/page',
    '- After: https://bc-c2-global--milo--adobecom.aem.page/drafts/bc/page',
    '- see also: https://business.stage.adobe.com/resources/x.html?milolibs=bc-c2-global.',
  ].join('\r\n'),
};

test('parsePrUrl accepts links and owner/repo#n', () => {
  assert.deepEqual(pc.parsePrUrl('https://github.com/adobecom/milo/pull/6872/files'), { owner: 'adobecom', repo: 'milo', number: 6872 });
  assert.deepEqual(pc.parsePrUrl('adobecom/da-bacom#12'), { owner: 'adobecom', repo: 'da-bacom', number: 12 });
  assert.equal(pc.parsePrUrl('https://github.com/adobecom/milo/issues/1'), null);
  assert.equal(pc.parsePrUrl(''), null);
});

test('prContext derives milolibs for same-repo and fork branches', () => {
  assert.equal(pc.prContext(pr6872).milolibs, '?milolibs=bc-c2-global');
  const fork = pc.prContext({ ...pr6872, head: { ref: 'Feat/X', repo: { name: 'milo', owner: { login: 'Jane' } } } });
  assert.equal(fork.milolibs, '?milolibs=feat-x--milo--jane');
  const bacom = pc.prContext({ ...pr6872, base: { repo: { name: 'da-bacom', owner: { login: 'adobecom' } } }, head: { ref: 'fix', repo: { name: 'da-bacom', owner: { login: 'adobecom' } } } });
  assert.equal(bacom.milolibs, '');
  assert.equal(bacom.branchHost, 'fix--da-bacom--adobecom.aem.page');
  assert.equal(bacom.mainHost, 'main--da-bacom--adobecom.aem.page');
});

test('testLines pairs Before/After and strips milolibs from single URLs', () => {
  const lines = pc.testLines(pr6872.body, pc.prContext(pr6872));
  assert.deepEqual(lines, [
    'https://stage--milo--adobecom.aem.page/drafts/bc/page | https://bc-c2-global--milo--adobecom.aem.page/drafts/bc/page',
    'https://business.stage.adobe.com/resources/x.html',
  ]);
});

test('lineFor pairs consumer pages main vs branch preview', () => {
  const ctx = { isMilo: false, mainHost: 'main--da-bacom--adobecom.aem.page', branchHost: 'fix--da-bacom--adobecom.aem.page' };
  assert.equal(pc.lineFor('https://business.adobe.com/products/x.html', ctx),
    'https://main--da-bacom--adobecom.aem.page/products/x.html | https://fix--da-bacom--adobecom.aem.page/products/x.html');
  assert.equal(pc.lineFor('https://fix--da-bacom--adobecom.aem.live/a', ctx),
    'https://main--da-bacom--adobecom.aem.page/a | https://fix--da-bacom--adobecom.aem.live/a');
  assert.equal(pc.lineFor('https://example.com/a', ctx), null);
});

test('classifyFiles splits blocks, shared code, BC and non-visual files', () => {
  const c = pc.classifyFiles([
    'libs/blocks/marquee/marquee.js',
    'libs/c2/blocks/brand-concierge/bc-utils.js',
    'libs/utils/utils.js',
    'test/blocks/marquee/marquee.test.js',
    'README.md',
    'nala/blocks/marquee/marquee.test.js',
  ]);
  assert.deepEqual(c.blocks, ['marquee', 'brand-concierge']);
  assert.deepEqual(c.shared, ['libs/utils/utils.js']);
  assert.equal(c.bc, true);
  assert.equal(c.files, 6);
});

test('planCheck maps changed blocks to dataset pages and flags uncovered ones', () => {
  const ctx = pc.prContext(pr6872);
  const plan = pc.planCheck({
    ctx,
    files: ['libs/blocks/marquee/marquee.css', 'libs/blocks/brand-concierge-global/x.js', 'libs/utils/utils.js'],
    body: pr6872.body,
    datasets: ['milo'],
    extraDatasets: ['milo', 'bacom'],
    pagesOf: { milo: [
      { key: 'marquee-split', a: 'https://main--milo--adobecom.aem.page/docs/library/kitchen-sink/marquee-split' },
      { key: 'aside', a: 'https://main--milo--adobecom.aem.page/docs/library/kitchen-sink/aside' },
    ] },
  });
  assert.deepEqual(plan.blocks.lines, ['https://main--milo--adobecom.aem.page/docs/library/kitchen-sink/marquee-split']);
  assert.deepEqual(plan.blocks.uncovered, ['brand-concierge-global']);
  assert.equal(plan.datasets.recommended, true);
  assert.deepEqual(plan.datasets.extra, ['bacom']);
  assert.equal(plan.bc.url, 'https://bc-c2-global--milo--adobecom.aem.page/drafts/bc/page');
  assert.equal(plan.milolibs, '?milolibs=bc-c2-global');
});

test('planCheck suggests any dataset that covers a changed block (uar for brand-concierge)', () => {
  const ctx = pc.prContext(pr6872);
  const plan = pc.planCheck({
    ctx,
    files: ['libs/blocks/brand-concierge/brand-concierge.js', 'libs/blocks/brand-concierge-global/x.js'],
    body: '',
    datasets: ['milo'],
    extraDatasets: ['milo', 'bacom'],
    pagesOf: {
      milo: [{ key: 'aside', a: 'https://main--milo--adobecom.aem.page/test/features/blocks/aside' }],
      uar: [{ key: 'basic-inline-block', a: 'https://main--milo--adobecom.aem.live/drafts/nala/blocks/brand-concierge/brand-concierge' }],
      bacom: [{ key: 'products-brand-concierge', a: 'https://main--da-bacom--adobecom.aem.live/products/brand-concierge' }],
    },
  });
  assert.deepEqual(plan.datasets.names, ['milo', 'uar']);
  assert.deepEqual(plan.datasets.covering, ['uar']);
  assert.deepEqual(plan.datasets.suggested, ['uar']);
  assert.equal(plan.datasets.recommended, true);
  assert.equal(plan.blocks.recommended, false);
  assert.deepEqual(plan.blocks.uncovered, []);
  const bodies = [];
  pc.startCheck({ pr: ctx, plan }, {}, { createRun: (b) => { bodies.push(b); return { id: `r${bodies.length}`, site: b.site }; } });
  assert.deepEqual(bodies.map((b) => b.site), ['uar']);
});

test('planCheck keeps datasets off for consumer repos', () => {
  const ctx = pc.prContext({ ...pr6872, body: '', base: { repo: { name: 'da-cc', owner: { login: 'adobecom' } } }, head: { ref: 'x', repo: { name: 'da-cc', owner: { login: 'adobecom' } } } });
  const plan = pc.planCheck({ ctx, files: ['scripts/scripts.js'], body: '', datasets: ['cc'], pagesOf: {} });
  assert.equal(plan.datasets.available, false);
  assert.equal(plan.datasets.recommended, false);
  assert.ok(plan.notes.some((n) => /No test URLs/.test(n)));
});

test('buildPlan fetches the PR and its files', async () => {
  const calls = [];
  const ghGet = async (p) => {
    calls.push(p);
    return p.includes('/files') ? [{ filename: 'libs/blocks/aside/aside.js' }] : pr6872;
  };
  const out = await pc.buildPlan('https://github.com/adobecom/milo/pull/6872', {
    ghGet,
    datasetsForRepo: () => ['milo'],
    listDatasetPages: async () => [{ key: 'aside', a: 'https://main--milo--adobecom.aem.page/aside' }],
  });
  assert.equal(calls[0], '/repos/adobecom/milo/pulls/6872');
  assert.equal(out.pr.branch, 'bc-c2-global');
  assert.deepEqual(out.plan.blocks.lines, ['https://main--milo--adobecom.aem.page/aside']);
  await assert.rejects(() => pc.buildPlan('nope', {}), /GitHub PR link/);
});

test('startCheck starts picked runs and summarize rolls up a verdict', async () => {
  pc.__test.reset();
  const ctx = pc.prContext(pr6872);
  const plan = pc.planCheck({ ctx, files: ['libs/utils/utils.js', 'libs/blocks/brand-concierge/x.js'], body: pr6872.body, datasets: ['milo'], pagesOf: {} });
  const bodies = [];
  let n = 0;
  const createRun = (body) => {
    bodies.push(body);
    if (body.site === 'milo') throw new Error('milo is already running');
    n += 1;
    return { id: `r${n}`, site: body.kind === 'quick' ? `quick-r${n}` : body.site || 'host' };
  };
  const check = pc.startCheck({ pr: ctx, plan }, {}, { createRun });
  assert.deepEqual(check.runs.map((r) => r.role), ['test-urls', 'bc']);
  assert.equal(check.errors[0].error, 'milo is already running');
  assert.equal(bodies[0].milolibs, '?milolibs=bc-c2-global');
  assert.deepEqual(bodies[0].viewports, pc.QUICK_VIEWPORTS);
  assert.equal(pc.listChecks()[0].id, check.id);
  assert.equal(pc.getCheck(check.id).pr.number, 6872);

  const snaps = {
    r1: { runId: 'r1', site: 'quick-r1', runKind: 'quick', mode: 'live', done: true, conclusion: 'success' },
    r2: { runId: 'r2', site: 'host', runKind: 'bc', mode: 'live', done: false },
  };
  const history = {
    getMetrics: async () => ({ entries: { a: { diffPct: 0.1, heightDelta: 0 }, b: { diffPct: 4.2, heightDelta: 0, urls: 'u' } } }),
    runReport: async () => ({ state: 'pending' }),
    ensureMetrics: async () => {},
    failureFor: () => null,
    isComputing: () => false,
  };
  const getRun = (id) => (snaps[id] ? { snapshot: () => snaps[id] } : null);
  const s = await pc.summarize(check, { getRun, history });
  assert.equal(s.runs[0].verdict, 'review');
  assert.deepEqual(s.runs[0].pages.map((p) => p.key), ['b']);
  assert.equal(s.runs[1].verdict, 'running');
  assert.equal(s.verdict, 'running');
  snaps.r2.done = true;
  snaps.r2.conclusion = 'failure';
  assert.equal((await pc.summarize(check, { getRun, history })).verdict, 'fail');
});

test('worst picks the most severe verdict', () => {
  assert.equal(pc.worst(['pass', null, 'review']), 'review');
  assert.equal(pc.worst([]), 'pass');
});
