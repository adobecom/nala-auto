import test from 'node:test';
import assert from 'node:assert/strict';
import { screenshotSiteInputs } from './workflowSites.js';

test('uses the workflow choice for built-in sites', () => {
  assert.deepEqual(screenshotSiteInputs('bacom'), { site: 'bacom' });
});

test('maps custom sites to the workflow custom input', () => {
  assert.deepEqual(screenshotSiteInputs('bacom-live-qa'), {
    site: 'custom',
    custom_site: 'bacom-live-qa',
  });
});

test('site groups put unknown custom datasets in CUSTOM only', async () => {
  const { siteGroups, allSites } = await import('./workflowSites.js');
  const groups = siteGroups(['milo', 'bacom-live-qa']);
  assert.ok(groups.MILOCORE.includes('milo'));
  assert.deepEqual(groups.CUSTOM, ['bacom-live-qa']);
  const all = allSites(['bacom-live-qa']);
  assert.ok(all.includes('milo') && all.includes('graybox-cc') && all.includes('bacom-live-qa'));
  assert.equal(new Set(all).size, all.length);
});
