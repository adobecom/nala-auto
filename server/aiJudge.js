// nala-auto AI diff judge — optional, pluggable vision-model backend for the
// "AI Judge" button in ImageDiff.jsx.
//
// This module does NOT ship with any bundled model or API key. It calls
// whatever OpenAI- or Anthropic-compatible vision endpoint the deployer
// configures via environment variables:
//
//   AI_JUDGE_API_KEY     required — presence of this is what "configured" means
//   AI_JUDGE_PROVIDER     'openai' (default) | 'anthropic'
//   AI_JUDGE_BASE_URL     override the default provider endpoint (e.g. Azure
//                         OpenAI, a self-hosted OpenAI-compatible proxy, or
//                         Anthropic's own regional endpoint)
//   AI_JUDGE_MODEL        override the default model
//                         (default: gpt-4o-mini for openai, claude-3-5-haiku-latest for anthropic)
//
// Without AI_JUDGE_API_KEY set, isConfigured() returns false and the /lab/judge
// route in index.js responds with a friendly "not configured" message instead
// of erroring — the button in the UI still renders, it just explains what an
// admin needs to set up. See README.md "AI Judge" section for provider notes.
/* global process, Buffer */

const S3_HOST = 'https://s3-sj3.corp.adobe.com/milo';

function s3Url(relPath) {
  return `${S3_HOST}/${relPath.split('/').map(encodeURIComponent).join('/')}`;
}

async function fetchImageBase64(relPath) {
  const url = s3Url(relPath);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'image/png';
  return { base64: buf.toString('base64'), mimeType: contentType.split(';')[0] };
}

const PROMPT = `You are a visual regression testing expert for websites. You will see two full-page screenshots of a web page: "baseline" (old version / production) and "new" (new version / staging), plus optionally a pixel-level diff overlay image (red = changed pixels).

Decide whether this diff represents a genuine, meaningful visual/content regression (e.g. copy changes, broken layout, missing or extra content, broken styling, clearly wrong colors/spacing) or harmless noise (e.g. carousel/video frames caught at different moments, timestamps, randomized recommended content, ads or promo banners, mid-animation transition states, hover states).

Output ONLY a single JSON object, with no other text and no markdown code fences, in exactly this shape:
{"verdict": "regression" | "noise" | "uncertain", "confidence": a number between 0 and 1, "reasoning": "a short explanation in English pointing to the specific area and what you observed"}`;

async function callOpenAiCompatible({ baseUrl, apiKey, model, images }) {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const content = [{ type: 'text', text: PROMPT }];
  images.forEach(({ base64, mimeType, label }) => {
    content.push({ type: 'text', text: label });
    content.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } });
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content }], max_tokens: 500, temperature: 0 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI-compatible API error ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

async function callAnthropic({ baseUrl, apiKey, model, images }) {
  const url = `${(baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`;
  const content = [{ type: 'text', text: PROMPT }];
  images.forEach(({ base64, mimeType, label }) => {
    content.push({ type: 'text', text: label });
    content.push({ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } });
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 500, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return (json.content || []).map((b) => b.text || '').join('');
}

function parseVerdict(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { verdict: 'uncertain', confidence: null, reasoning: raw.trim() || 'The model did not return a parseable result' };
  try {
    const parsed = JSON.parse(match[0]);
    return {
      verdict: ['regression', 'noise', 'uncertain'].includes(parsed.verdict) ? parsed.verdict : 'uncertain',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
      reasoning: parsed.reasoning || raw.trim(),
    };
  } catch {
    return { verdict: 'uncertain', confidence: null, reasoning: raw.trim() };
  }
}

export function isConfigured() {
  return Boolean(process.env.AI_JUDGE_API_KEY);
}

// { a, b, diff }: S3-relative image paths, same shape as the entries in a
// dataset's results.json (e.g. "screenshots/bacom-live-qa/Foo-chrome-a.png").
export async function judgeDiff({ a, b, diff }) {
  const apiKey = process.env.AI_JUDGE_API_KEY;
  if (!apiKey) {
    const err = new Error('AI_JUDGE_API_KEY not set');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  const provider = (process.env.AI_JUDGE_PROVIDER || 'openai').toLowerCase();
  const baseUrl = process.env.AI_JUDGE_BASE_URL || (provider === 'anthropic' ? undefined : 'https://api.openai.com/v1');
  const model = process.env.AI_JUDGE_MODEL || (provider === 'anthropic' ? 'claude-3-5-haiku-latest' : 'gpt-4o-mini');

  const [imgA, imgB, imgDiff] = await Promise.all([
    fetchImageBase64(a),
    fetchImageBase64(b),
    diff ? fetchImageBase64(diff) : Promise.resolve(null),
  ]);
  const images = [
    { ...imgA, label: '[baseline]' },
    { ...imgB, label: '[new]' },
  ];
  if (imgDiff) images.push({ ...imgDiff, label: '[pixel-diff overlay, red = changed pixels]' });

  const raw = provider === 'anthropic'
    ? await callAnthropic({ baseUrl, apiKey, model, images })
    : await callOpenAiCompatible({ baseUrl, apiKey, model, images });

  return parseVerdict(raw);
}
