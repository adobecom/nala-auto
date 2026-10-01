import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeConfig, parseVerdict } from './aiJudge.js';

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

test('parseVerdict reads complete JSON after leading whitespace', () => {
  const r = parseVerdict('\n\n{"verdict":"noise","confidence":0.9,"reasoning":"same"}');
  assert.deepEqual(r, { verdict: 'noise', confidence: 0.9, reasoning: 'same' });
});

test('parseVerdict recovers fields from truncated JSON', () => {
  const r = parseVerdict('{"verdict": "regression", "confidence": 0.92, "reasoning": "The hero \\"headline\\" changed and');
  assert.equal(r.verdict, 'regression');
  assert.equal(r.confidence, 0.92);
  assert.equal(r.reasoning, 'The hero "headline" changed and');
});

test('parseVerdict falls back to uncertain for free text', () => {
  assert.equal(parseVerdict('no idea').verdict, 'uncertain');
});
