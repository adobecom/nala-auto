// nala-auto "Ask" agent — a chat assistant that can read this console's own
// data (recent runs, BC monitor results, screenshot-diff datasets) and answer
// questions about them.
//
// Like aiJudge.js this ships with no bundled key. It talks to any
// OpenAI-compatible chat endpoint, configured via environment variables:
//
//   AI_FOUNDRY_API_KEY    required — presence of this is what "configured" means
//   AI_FOUNDRY_BASE_URL   default: Adobe AI Foundry's LiteLLM gateway
//                         (https://apigw.infra.adobe.net/ehl/api/v1/ehl/v1)
//   AI_FOUNDRY_MODEL      default: aifoundry/Qwen/Qwen-latest
//
// AI Foundry issues per-user "virtual keys" (sk-...) at
// https://aifoundry-preview.corp.adobe.com — the gateway is plain
// OpenAI-compatible: POST {base}/chat/completions with `Authorization: Bearer`.
//
// The key never reaches the browser: the UI posts to /lab/ask and this module
// is the only thing that holds it. See README.md "Ask agent".
/* global process */

import { listRuns } from './runner.js';
import { getCustomSites } from './customSites.js';
import { BUILTIN_SITES } from './workflowSites.js';

const DEFAULT_BASE_URL = 'https://apigw.infra.adobe.net/ehl/api/v1/ehl/v1';
const DEFAULT_MODEL = 'aifoundry/Qwen/Qwen-latest';
const S3_HOST = 'https://s3-sj3.corp.adobe.com/milo';

// Cheap guards against a runaway tool loop or a context blow-up. The models on
// AI Foundry are small, so every tool result is trimmed hard before it goes back.
const MAX_TOOL_ROUNDS = 4;
const MAX_HISTORY = 20;

export function config() {
  return {
    baseUrl: (process.env.AI_FOUNDRY_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    model: process.env.AI_FOUNDRY_MODEL || DEFAULT_MODEL,
    apiKey: process.env.AI_FOUNDRY_API_KEY || '',
  };
}

export function isConfigured() {
  return Boolean(process.env.AI_FOUNDRY_API_KEY);
}

async function s3Json(relPath) {
  const url = `${S3_HOST}/${relPath}`;
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------- tools

const TOOLS = [
  {
    name: 'list_runs',
    description: 'List the most recent runs dispatched from this console (screenshot-diff, Figma compare, iOS and Brand Concierge runs). Use this to answer "what ran recently", "did my run finish", "what failed".',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'How many runs to return, 1-20. Default 8.' },
        kind: { type: 'string', description: 'Optional filter: "bc" for Brand Concierge runs, "screenshot" for everything else.' },
      },
    },
    run: async ({ limit, kind }) => {
      let runs = listRuns(20);
      if (kind === 'bc') runs = runs.filter((r) => r.runKind === 'bc');
      if (kind === 'screenshot') runs = runs.filter((r) => r.runKind !== 'bc');
      return runs.slice(0, Math.min(Math.max(Number(limit) || 8, 1), 20)).map((r) => ({
        runId: r.runId,
        kind: r.runKind || 'screenshot',
        site: r.site,
        status: r.status,
        conclusion: r.conclusion,
        done: r.done,
        note: r.note,
        resultsUrl: r.resultsUrl,
      }));
    },
  },
  {
    name: 'list_datasets',
    description: 'List the screenshot-diff datasets (sites) this console knows about.',
    parameters: { type: 'object', properties: {} },
    run: async () => ({
      builtin: BUILTIN_SITES,
      custom: getCustomSites(),
    }),
  },
  {
    name: 'get_dataset_results',
    description: 'Fetch the latest screenshot-diff results for one dataset and summarise how many pages passed/failed, plus the worst offenders. Use this for "what is failing on bacom-live-qa".',
    parameters: {
      type: 'object',
      properties: { dataset: { type: 'string', description: 'Dataset name, e.g. "bacom-live-qa". Use list_datasets if unsure.' } },
      required: ['dataset'],
    },
    run: async ({ dataset }) => {
      if (!dataset || !/^[\w.-]+$/.test(dataset)) throw new Error('invalid dataset name');
      const data = await s3Json(`screenshots/${encodeURIComponent(dataset)}/results.json`);
      const rows = Array.isArray(data) ? data : data?.results || [];
      const failing = rows
        .filter((r) => Number(r.diffPercentage ?? r.diff ?? 0) > 0)
        .sort((a, b) => Number(b.diffPercentage ?? b.diff ?? 0) - Number(a.diffPercentage ?? a.diff ?? 0));
      return {
        dataset,
        total: rows.length,
        failing: failing.length,
        passing: rows.length - failing.length,
        worst: failing.slice(0, 10).map((r) => ({
          name: r.name || r.url || r.path,
          device: r.device || r.shard,
          diffPercentage: r.diffPercentage ?? r.diff,
        })),
      };
    },
  },
  {
    name: 'get_bc_monitor',
    description: 'Fetch the Brand Concierge agent monitor summary for a run: which agent routes (Product Advisor, Genie, Firefly, Book a Meeting, Live Agent, guardrails) passed, need review, or errored. Use this for any Brand Concierge / BC agent question.',
    parameters: {
      type: 'object',
      properties: { runId: { type: 'string', description: 'BC run id. Omit for the latest run.' } },
    },
    run: async ({ runId }) => {
      let id = runId;
      if (!id) {
        const index = await s3Json('screenshots/bc-agent/runs/index.json');
        const entries = Array.isArray(index) ? index : index?.runs || [];
        id = entries[0]?.runId || entries[0]?.id;
        if (!id) throw new Error('no published BC runs found');
      }
      const summary = await s3Json(`screenshots/bc-agent/runs/${encodeURIComponent(id)}/workflow-summary.json`);
      const checks = summary.checks || summary.monitor?.checks || [];
      return {
        runId: id,
        suite: summary.suite,
        url: summary.url,
        status: summary.status,
        passed: summary.passed,
        total: summary.total ?? checks.length,
        checks: checks.map((c) => ({
          id: c.id,
          status: c.status,
          flaky: c.flaky || undefined,
          observed: c.observed,
        })),
      };
    },
  },
];

const toolSchema = TOOLS.map(({ name, description, parameters }) => ({
  type: 'function',
  function: { name, description, parameters },
}));

// Small models drown in raw JSON — cap what comes back from every tool.
function clip(value, max = 2500) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}… [truncated]` : text;
}

async function runTool(name, rawArgs) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return clip({ error: `unknown tool ${name}` });
  let args = {};
  try {
    args = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : rawArgs || {};
  } catch {
    args = {};
  }
  try {
    return clip(await tool.run(args));
  } catch (e) {
    return clip({ error: String(e.message || e) });
  }
}

// Small models drop the FOLLOW_UPS line often enough that an empty panel would
// look broken. Fall back to whatever the tools it just called make sensible.
const FALLBACKS = {
  list_runs: ['Which of those failed?', 'Show the latest BC monitor run'],
  list_datasets: ['What is failing on bacom-live-qa?', 'What ran recently?'],
  get_dataset_results: ['Which viewport is worst?', 'Has this regressed since the last run?'],
  get_bc_monitor: ['Which checks need review and why?', 'Were any checks flaky?'],
};

function fallbackFollowUps(used) {
  const out = [];
  [...new Set(used)].forEach((name) => {
    (FALLBACKS[name] || []).forEach((q) => { if (!out.includes(q)) out.push(q); });
  });
  return out.slice(0, 3);
}

// ---------------------------------------------------------------- chat

const SYSTEM_PROMPT = `You are the Ask agent built into nala-auto, Adobe's internal visual-QA and Brand Concierge monitoring console (http://nala-auto.corp.adobe.com).

What this console does:
- Screenshot diff: Playwright captures pages on a baseline and a new build (usually ?milolibs=stage) across chrome/ipad/iphone viewports and pixel-diffs them. Results live per dataset (e.g. bacom-live-qa).
- Figma compare: diffs one Figma frame against a live page region.
- Manual iOS: a live iOS Simulator session driven from the browser.
- BC workflow: a monitor suite that drives Brand Concierge on business.adobe.com / www.adobe.com and checks that each agent route (Product Advisor, Genie, Firefly, Book a Meeting, Live Agent) and the guardrails still behave. Checks are PASS, REVIEW (needs a human look), ERROR or SKIP; "flaky" means it only passed on retry.

Rules:
- Use the tools to get real data. Never invent run ids, numbers or results.
- If a tool errors or returns nothing, say so plainly instead of guessing.
- Answer in English, concise and concrete. Prefer short prose or a small markdown table over long lists.
- You are read-only: you cannot start, stop or change runs. If asked, point the user at the Run console or BC workflow page.

After your answer, always add one final line in exactly this form:

FOLLOW_UPS: <question> | <question> | <question>

Give two or three short follow-up questions (max ~8 words each) that this console can actually answer from the data — drilling into a specific failing dataset, run or check you just mentioned. Write them as the user would ask them. Never repeat the question you were just asked. This line is stripped before the user sees it, so never refer to it.`;

// The model appends "FOLLOW_UPS: a | b | c" to its answer; split that off so
// the chat bubble stays clean and the UI can render them as buttons. Small
// models forget sometimes, hence the callers' static fallback.
function splitFollowUps(raw) {
  const text = (raw || '').trim();
  const match = text.match(/\n*FOLLOW[ _-]?UPS\s*:\s*(.+)$/is);
  if (!match) return { reply: text, followUps: [] };
  const followUps = match[1]
    .split(/\||\n/)
    .map((s) => s.replace(/^[\s\-*\d.)]+/, '').trim())
    .filter((s) => s.length > 3 && s.length <= 80)
    .slice(0, 3);
  return { reply: text.slice(0, match.index).trim(), followUps };
}

function sanitizeHistory(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

async function completion({ baseUrl, apiKey, model, messages, withTools }) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 800,
      ...(withTools ? { tools: toolSchema, tool_choice: 'auto' } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`AI Foundry ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    // Not every model behind the gateway advertises function calling. A 400
    // that mentions tools means "ask again without them" rather than a dead end.
    err.toolsUnsupported = Boolean(withTools) && res.status === 400 && /tool|function/i.test(text);
    throw err;
  }
  return res.json();
}

// Retries once without tools when the gateway rejects them, so a model that
// cannot call functions still answers — just without live console data.
async function completionWithFallback(opts) {
  try {
    return await completion(opts);
  } catch (e) {
    if (!e.toolsUnsupported) throw e;
    return completion({ ...opts, withTools: false });
  }
}

export async function ask({ messages }) {
  const { baseUrl, apiKey, model } = config();
  if (!apiKey) {
    const err = new Error('AI_FOUNDRY_API_KEY not set');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  const history = sanitizeHistory(messages);
  if (!history.length) throw new Error('no user message');

  const thread = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
  const used = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const json = await completionWithFallback({
      baseUrl,
      apiKey,
      model,
      messages: thread,
      // On the final round drop the tools so the model is forced to answer.
      withTools: round < MAX_TOOL_ROUNDS,
    });
    const message = json.choices?.[0]?.message;
    if (!message) throw new Error('empty response from AI Foundry');
    const calls = message.tool_calls || [];
    if (!calls.length) {
      const { reply, followUps } = splitFollowUps(message.content);
      return { reply, followUps: followUps.length ? followUps : fallbackFollowUps(used), tools: used, model };
    }
    thread.push({ role: 'assistant', content: message.content || '', tool_calls: calls });
    const results = await Promise.all(calls.map((call) => runTool(call.function?.name, call.function?.arguments)));
    calls.forEach((call, i) => {
      used.push(call.function?.name);
      thread.push({ role: 'tool', tool_call_id: call.id, name: call.function?.name, content: results[i] });
    });
  }
  return { reply: '', followUps: [], tools: used, model };
}

export const __test = { TOOLS, sanitizeHistory, clip, splitFollowUps, fallbackFollowUps };
