import test from 'node:test';
import assert from 'node:assert/strict';
import { manualSessionConfig } from './manualSessions.js';

test('manual sessions are disabled without an agent URL and token', () => {
  const config = manualSessionConfig();
  assert.equal(config.enabled, false);
  assert.equal(config.session, null);
  assert.equal(config.ttlMinutes, 30);
});
