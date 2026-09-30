import assert from 'node:assert/strict';
import test from 'node:test';
import { __test, config, isConfigured } from './askAgent.js';
/* global process */

const { TOOLS, sanitizeHistory, clip } = __test;

test('isConfigured follows AI_FOUNDRY_API_KEY', () => {
  const saved = process.env.AI_FOUNDRY_API_KEY;
  delete process.env.AI_FOUNDRY_API_KEY;
  assert.equal(isConfigured(), false);
  process.env.AI_FOUNDRY_API_KEY = 'sk-test';
  assert.equal(isConfigured(), true);
  if (saved === undefined) delete process.env.AI_FOUNDRY_API_KEY;
  else process.env.AI_FOUNDRY_API_KEY = saved;
});

test('defaults point at the AI Foundry gateway', () => {
  const { baseUrl, model } = config();
  assert.match(baseUrl, /apigw\.infra\.adobe\.net/);
  assert.ok(!baseUrl.endsWith('/'));
  assert.equal(model, 'aifoundry/Qwen/Qwen-latest');
});

test('every tool has a name, description and JSON-schema parameters', () => {
  assert.ok(TOOLS.length >= 4);
  TOOLS.forEach((t) => {
    assert.ok(t.name && t.description, `${t.name} missing metadata`);
    assert.equal(t.parameters.type, 'object');
    assert.equal(typeof t.run, 'function');
  });
});

test('sanitizeHistory drops non-chat roles and caps length', () => {
  const messages = [
    { role: 'system', content: 'ignore me' },
    { role: 'user', content: '  ' },
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi' },
    { role: 'tool', content: 'nope' },
  ];
  assert.deepEqual(sanitizeHistory(messages), [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi' },
  ]);
  assert.deepEqual(sanitizeHistory(null), []);
  assert.equal(sanitizeHistory([{ role: 'user', content: 'x'.repeat(9000) }])[0].content.length, 4000);
});

test('sanitizeHistory keeps only the most recent turns', () => {
  const long = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `q${i}` }));
  const out = sanitizeHistory(long);
  assert.equal(out.length, 20);
  assert.equal(out[0].content, 'q10');
});

test('clip truncates oversized tool output', () => {
  assert.equal(clip({ a: 1 }), '{"a":1}');
  const big = clip({ a: 'x'.repeat(5000) });
  assert.ok(big.length < 2600);
  assert.match(big, /truncated/);
});

test('get_dataset_results rejects path-traversing dataset names', async () => {
  const tool = TOOLS.find((t) => t.name === 'get_dataset_results');
  await assert.rejects(tool.run({ dataset: '../secrets' }), /invalid dataset/);
  await assert.rejects(tool.run({ dataset: '' }), /invalid dataset/);
});

test('list_datasets returns builtin and custom buckets', async () => {
  const tool = TOOLS.find((t) => t.name === 'list_datasets');
  const out = await tool.run({});
  assert.ok(Array.isArray(out.builtin) && out.builtin.length);
  assert.ok(Array.isArray(out.custom));
});

test('list_runs clamps the limit', async () => {
  const tool = TOOLS.find((t) => t.name === 'list_runs');
  assert.ok((await tool.run({ limit: 999 })).length <= 20);
  assert.ok(Array.isArray(await tool.run({})));
});
