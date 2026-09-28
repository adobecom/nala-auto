import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWebUrl, parseFigmaUrl, parseSelector, parseViewport, parseFigmaRun, SELECTOR_MAX,
} from './figmaCompare.js';

const VIEWPORTS = ['chrome', 'ipad', 'iphone'];

test('accepts an http(s) page URL and trims it', () => {
  assert.equal(parseWebUrl('  https://business.adobe.com/x.html '), 'https://business.adobe.com/x.html');
});

test('rejects a missing or non-http page URL', () => {
  assert.throws(() => parseWebUrl(''), /Enter the web page URL/);
  assert.throws(() => parseWebUrl('business.adobe.com/x'), /Not a valid web page URL/);
  assert.throws(() => parseWebUrl('javascript:alert(1)'), /Not a valid web page URL/);
});

test('accepts design, file and proto links and normalises node-id to the API form', () => {
  for (const kind of ['design', 'file', 'proto']) {
    const url = `https://www.figma.com/${kind}/AbCdEf123456/Marquee?node-id=12-345`;
    assert.deepEqual(parseFigmaUrl(url), { url, fileKey: 'AbCdEf123456', nodeId: '12:345' });
  }
});

test('accepts a node-id already written in colon form', () => {
  const url = 'https://figma.com/design/AbCdEf123456/M?node-id=12:345';
  assert.equal(parseFigmaUrl(url).nodeId, '12:345');
});

test('rejects non-figma hosts, missing file keys and missing or malformed node-ids', () => {
  assert.throws(() => parseFigmaUrl(''), /Enter the Figma/);
  assert.throws(() => parseFigmaUrl('not a url'), /Not a valid Figma URL/);
  assert.throws(() => parseFigmaUrl('https://figma.example.com/design/AbCdEf123456/M?node-id=1-2'), /Not a figma.com URL/);
  assert.throws(() => parseFigmaUrl('https://www.figma.com/AbCdEf123456?node-id=1-2'), /file key/);
  assert.throws(() => parseFigmaUrl('https://www.figma.com/design/AbCdEf123456/Marquee'), /missing node-id/);
  assert.throws(() => parseFigmaUrl('https://www.figma.com/design/AbCdEf123456/M?node-id=abc'), /Not a valid Figma node-id/);
});

test('requires a single-line selector within the length cap', () => {
  assert.equal(parseSelector('  .marquee.split '), '.marquee.split');
  assert.throws(() => parseSelector(''), /CSS selector/);
  assert.throws(() => parseSelector('.a\n.b'), /single line/);
  assert.throws(() => parseSelector('x'.repeat(SELECTOR_MAX + 1)), /too long/);
});

test('requires exactly one known viewport', () => {
  assert.equal(parseViewport(['ipad'], VIEWPORTS), 'ipad');
  assert.equal(parseViewport('chrome', VIEWPORTS), 'chrome');
  assert.throws(() => parseViewport([], VIEWPORTS), /exactly one viewport/);
  assert.throws(() => parseViewport(['chrome', 'ipad'], VIEWPORTS), /exactly one viewport/);
  assert.throws(() => parseViewport(['desktop'], VIEWPORTS), /Unknown viewport/);
});

test('parseFigmaRun reads both camelCase and workflow-style field names', () => {
  const expected = {
    webUrl: 'https://business.adobe.com/x.html',
    figma: {
      url: 'https://www.figma.com/design/AbCdEf123456/M?node-id=12-345',
      fileKey: 'AbCdEf123456',
      nodeId: '12:345',
    },
    selector: '.marquee',
    viewport: 'iphone',
  };
  assert.deepEqual(
    parseFigmaRun({
      urls: 'https://business.adobe.com/x.html',
      figmaUrl: 'https://www.figma.com/design/AbCdEf123456/M?node-id=12-345',
      selector: '.marquee',
      viewports: ['iphone'],
    }, VIEWPORTS),
    expected,
  );
  assert.deepEqual(
    parseFigmaRun({
      url: 'https://business.adobe.com/x.html',
      figma_url: 'https://www.figma.com/design/AbCdEf123456/M?node-id=12-345',
      selector: '.marquee',
      viewport: 'iphone',
    }, VIEWPORTS),
    expected,
  );
});
