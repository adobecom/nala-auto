import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeConfig } from './aiJudge.js';

test('judge falls back to the AI Foundry key and Qwen vision model', () => {
  assert.equal(judgeConfig({}), null);
  const cfg = judgeConfig({ AI_FOUNDRY_API_KEY: 'sk-x' });
  assert.equal(cfg.apiKey, 'sk-x');
  assert.equal(cfg.model, 'aifoundry/Qwen/Qwen-latest');
  assert.match(cfg.baseUrl, /apigw\.infra\.adobe\.net/);
  assert.equal(judgeConfig({ AI_FOUNDRY_API_KEY: 'sk-x', AI_JUDGE_MODEL: 'm' }).model, 'm');
});

test('a dedicated AI_JUDGE_API_KEY wins', () => {
  const cfg = judgeConfig({ AI_JUDGE_API_KEY: 'k', AI_FOUNDRY_API_KEY: 'sk-x' });
  assert.equal(cfg.apiKey, 'k');
  assert.equal(cfg.model, 'gpt-4o-mini');
});
