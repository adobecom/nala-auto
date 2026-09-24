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
