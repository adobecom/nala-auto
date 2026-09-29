/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.RUNS_STATE_FILE = path.join(os.tmpdir(), `nala-runs-test-${process.pid}.json`);
const { parseQuickUrls, parseBcUrl, inputsFor, createRun, QUICK_MAX_URLS } = await import('./runner.js');

test('parses plain URLs and A | B pairs, skipping blanks and comments', () => {
  assert.deepEqual(
    parseQuickUrls('https://a.com/x\n\n# note\n  https://a.com/y | https://b.com/y  \r\n'),
    ['https://a.com/x', 'https://a.com/y | https://b.com/y'],
  );
});

test('keeps commas inside URLs', () => {
  assert.deepEqual(parseQuickUrls('https://a.com/?ids=1,2,3'), ['https://a.com/?ids=1,2,3']);
});

test('rejects empty lists, non-http lines, triple pipes and oversized lists', () => {
  assert.throws(() => parseQuickUrls('  \n# only a comment'), /at least one URL/);
  assert.throws(() => parseQuickUrls('https://ok.com\nbusiness.adobe.com/x'), /Not a valid URL line/);
  assert.throws(() => parseQuickUrls('https://ok.com | javascript:alert(1)'), /Not a valid URL line/);
  assert.throws(() => parseQuickUrls('https://a.com | https://b.com | https://c.com'), /Not a valid URL line/);
  const many = Array.from({ length: QUICK_MAX_URLS + 1 }, (_, i) => `https://a.com/${i}`).join('\n');
  assert.throws(() => parseQuickUrls(many), /capped/);
});

test('quick runs dispatch as a one-off custom site with urls + viewports', () => {
  assert.deepEqual(
    inputsFor({
      kind: 'quick', site: 'quick-ab12cd34', milolibs: '?milolibs=stage',
      urls: ['https://a.com/x', 'https://a.com/y | https://b.com/y'], viewports: ['chrome', 'iphone'],
    }),
    {
      site: 'custom',
      custom_site: 'quick-ab12cd34',
      milo_libs: '?milolibs=stage',
      urls: 'https://a.com/x\nhttps://a.com/y | https://b.com/y',
      viewports: 'chrome,iphone',
    },
  );
});

test('dataset runs keep their original dispatch shape', () => {
  assert.deepEqual(inputsFor({ kind: 'screenshot', site: 'bacom', milolibs: '?milolibs=stage' }), {
    site: 'bacom', milo_libs: '?milolibs=stage',
  });
});

test('every run kind dispatches its own run_id so results are published per run', () => {
  assert.equal(inputsFor({ kind: 'screenshot', id: 'ab12cd34', site: 'bacom', milolibs: '' }).run_id, 'ab12cd34');
  assert.equal(
    inputsFor({ kind: 'quick', id: 'ab12cd34', site: 'quick-ab12cd34', milolibs: '', urls: ['https://a.com'], viewports: ['chrome'] }).run_id,
    'ab12cd34',
  );
  assert.equal(
    inputsFor({
      kind: 'ios', id: 'ab12cd34', site: 'bacom', milolibs: '',
      iosVersions: ['18.3'], devices: ['iPhone 16'], maxUrls: 0,
    }).run_id,
    'ab12cd34',
  );
});

test('run_id is omitted rather than sent as undefined when a run has no id', () => {
  const inputs = inputsFor({ kind: 'screenshot', site: 'bacom', milolibs: '?milolibs=stage' });
  assert.ok(!('run_id' in inputs));
});

test('BC runs dispatch the standard workflow with an arbitrary http(s) URL', () => {
  assert.deepEqual(inputsFor({
    kind: 'bc',
    id: 'ab12cd34',
    urls: ['https://business.stage.adobe.com/?milolibs=my-branch'],
  }), {
    run_id: 'ab12cd34',
    url: 'https://business.stage.adobe.com/?milolibs=my-branch',
  });
  assert.equal(parseBcUrl('https://example.com/path'), 'https://example.com/path');
  assert.throws(() => parseBcUrl('file:///tmp/page.html'), /http or https/);
  assert.throws(() => parseBcUrl('not-a-url'), /valid/);
});

test('a BC run uses the shared tracked-run lifecycle without image-diff URLs', () => {
  const run = createRun({ kind: 'bc', url: 'https://business.stage.adobe.com/?milolibs=stage' });
  assert.equal(run.kind, 'bc');
  assert.equal(run.site, 'business.stage.adobe.com');
  assert.deepEqual(run.urls, ['https://business.stage.adobe.com/?milolibs=stage']);
  assert.equal(run.resultsUrl, null);
  assert.equal(run.latestResultsUrl, null);
  assert.equal(run.jobs[0]?.name, 'brand-concierge-agent');
});

test('figma runs dispatch one URL, one viewport and the figma inputs', () => {
  assert.deepEqual(
    inputsFor({
      kind: 'figma',
      id: 'ab12cd34',
      site: 'figma-ab12cd34',
      milolibs: '?milolibs=stage',
      urls: ['https://business.adobe.com/x.html'],
      viewports: ['chrome'],
      figmaUrl: 'https://www.figma.com/design/AbCdEf123456/Marquee?node-id=12-345',
      selector: '.marquee.split',
    }),
    {
      run_id: 'ab12cd34',
      site: 'custom',
      custom_site: 'figma-ab12cd34',
      milo_libs: '?milolibs=stage',
      urls: 'https://business.adobe.com/x.html',
      viewports: 'chrome',
      figma_url: 'https://www.figma.com/design/AbCdEf123456/Marquee?node-id=12-345',
      selector: '.marquee.split',
    },
  );
});

test('a figma run gets its own one-off dataset and a run-pinned results URL', () => {
  const run = createRun({
    kind: 'figma',
    urls: 'https://business.adobe.com/x.html',
    figmaUrl: 'https://www.figma.com/design/AbCdEf123456/Marquee?node-id=12-345',
    selector: '.marquee.split',
    viewports: ['ipad'],
  });
  assert.equal(run.site, `figma-${run.id}`);
  assert.deepEqual(run.viewports, ['ipad']);
  assert.deepEqual(run.urls, ['https://business.adobe.com/x.html']);
  // node-id is normalised to the `1:23` form Figma's REST API expects.
  assert.equal(run.figmaNodeId, '12:345');
  assert.equal(run.figmaFileKey, 'AbCdEf123456');
  assert.ok(run.resultsUrl.endsWith(`/imagediff/figma-${run.id}?run=${run.id}`));
  assert.ok(run.latestResultsUrl.endsWith(`/imagediff/figma-${run.id}`));
});

test('createRun rejects an invalid figma request before dispatching', () => {
  const ok = {
    kind: 'figma',
    urls: 'https://business.adobe.com/x.html',
    figmaUrl: 'https://www.figma.com/design/AbCdEf123456/Marquee?node-id=12-345',
    selector: '.marquee.split',
    viewports: ['chrome'],
  };
  assert.throws(() => createRun({ ...ok, urls: 'business.adobe.com/x' }), /Not a valid web page URL/);
  assert.throws(() => createRun({ ...ok, selector: '   ' }), /CSS selector/);
  assert.throws(() => createRun({ ...ok, viewports: ['chrome', 'ipad'] }), /exactly one viewport/);
  assert.throws(() => createRun({ ...ok, viewports: [] }), /exactly one viewport/);
});
