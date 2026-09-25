#!/usr/bin/env node
// nala-diff-judge-mcp
//
// An MCP server for nala-auto's screenshot-diff results. It does NOT run any
// vision model itself — it fetches the baseline/new/diff screenshots for a
// dataset + snapshot key and returns them as image content blocks in the MCP
// tool response. Whichever MCP client is calling it (Copilot CLI, Claude
// Desktop, Cursor, etc.) already has its own vision-capable model, so *that*
// model looks at the images and makes the judgment call — no separate API
// key, no local vision model, no ToS concerns.
//
// Data source: nala-auto publishes screenshot-diff results per dataset at
//   https://s3-sj3.corp.adobe.com/milo/screenshots/{dataset}/results.json
// (same S3 bucket the nala-auto web app proxies through /api/milo/...).
// Requires Adobe corp network/VPN access, same as the nala-auto site itself.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const S3_HOST = 'https://s3-sj3.corp.adobe.com/milo';

// Known built-in datasets (mirrors src/pages/Home.jsx menuData in nala-auto).
// This is just a convenience hint for `list_known_datasets` — any dataset
// name that has a published results.json will work with `list_snapshots` /
// `get_diff_images`, including custom ones added via nala-auto's "+ Add
// dataset" button.
const KNOWN_DATASETS = [
  'milo', 'caas', 'uar', 'feds',
  'sot', 'homepage', 'dc', 'cc', 'bacom', 'bacom-blog', 'express',
  'graybox-homepage', 'graybox-dc', 'graybox-cc', 'graybox-bacom', 'graybox-federal', 'da-bacom-graybox',
  'da-homepage', 'da-dc', 'da-cc', 'da-bacom', 'da-bacom-blog', 'da-feds',
];

function s3Url(relPath) {
  const encoded = relPath.split('/').map(encodeURIComponent).join('/');
  return `${S3_HOST}/${encoded}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'nala-diff-judge-mcp/1.0' } });
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status} ${res.statusText}) for ${url}`);
  }
  return res.json();
}

async function fetchImageBase64(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'nala-diff-judge-mcp/1.0' } });
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status} ${res.statusText}) for ${url}`);
  }
  const contentType = res.headers.get('content-type') || 'image/png';
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString('base64'), mimeType: contentType.split(';')[0] };
}

async function getResults(dataset) {
  const url = `${S3_HOST}/screenshots/${encodeURIComponent(dataset)}/results.json`;
  return fetchJson(url);
}

const server = new McpServer({
  name: 'nala-diff-judge-mcp',
  version: '1.0.0',
});

server.registerTool(
  'list_known_datasets',
  {
    title: 'List known nala-auto screenshot-diff datasets',
    description:
      'Returns a list of commonly-used dataset names for nala-auto screenshot-diff results (e.g. "bacom", "bacom-live-qa"). ' +
      'This is just a convenience list of built-ins — custom datasets not in this list may still work with list_snapshots ' +
      'if you already know their name (e.g. from the nala-auto site URL like /imagediff/{dataset}).',
    inputSchema: {},
  },
  async () => ({
    content: [{ type: 'text', text: JSON.stringify(KNOWN_DATASETS, null, 2) }],
  }),
);

server.registerTool(
  'list_snapshots',
  {
    title: 'List screenshot-diff snapshots for a dataset',
    description:
      'Fetches results.json for a nala-auto dataset and lists every snapshot key (page name) with its order, ' +
      'compared URLs, and whether it has a-image/b-image/diff-image entries. Use this to find which key/order ' +
      'to pass to get_diff_images.',
    inputSchema: {
      dataset: z.string().describe('Dataset name, e.g. "bacom-live-qa" (same as the /imagediff/{dataset} URL on nala-auto).'),
    },
  },
  async ({ dataset }) => {
    const results = await getResults(dataset);
    const summary = Object.entries(results).map(([key, entries]) => ({
      key,
      variants: entries.map((e) => ({ order: e.order, urls: e.urls })),
    }));
    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
    };
  },
);

server.registerTool(
  'get_diff_images',
  {
    title: 'Get baseline/new/diff screenshots for one snapshot',
    description:
      'Fetches the baseline (a), new (b), and pixel-diff (diff) screenshots for one snapshot key in a dataset, ' +
      'and returns them as images plus the compared URLs. Look at the three images yourself and judge whether the ' +
      'diff represents a meaningful visual regression (content, layout, or copy changes) or noise (video frame ' +
      'differences, timestamps, ads/promo banners, animation state, etc). Explain your reasoning and cite what you see.',
    inputSchema: {
      dataset: z.string().describe('Dataset name, e.g. "bacom-live-qa".'),
      key: z.string().describe('Snapshot key/page name, e.g. "It Starts with Adobe-chrome" (as returned by list_snapshots).'),
      order: z.number().int().optional().describe('Which variant entry to use if a key has multiple (default: first/order 1).'),
    },
  },
  async ({ dataset, key, order }) => {
    const results = await getResults(dataset);
    const entries = results[key];
    if (!entries || entries.length === 0) {
      throw new Error(`No snapshot found for key "${key}" in dataset "${dataset}". Use list_snapshots to see valid keys.`);
    }
    const entry = order != null ? entries.find((e) => e.order === order) || entries[0] : entries[0];

    const [a, b, diff] = await Promise.all([
      fetchImageBase64(s3Url(entry.a)),
      fetchImageBase64(s3Url(entry.b)),
      entry.diff ? fetchImageBase64(s3Url(entry.diff)) : null,
    ]);

    const content = [
      {
        type: 'text',
        text:
          `Dataset: ${dataset}\nKey: ${key}\nOrder: ${entry.order}\nCompared URLs: ${entry.urls}\n\n` +
          `Below: [1] baseline (a), [2] new (b)${diff ? ', [3] pixel-diff overlay (diff)' : ''}. ` +
          `Judge whether this is a meaningful regression or noise.`,
      },
      { type: 'text', text: '[1] Baseline (a):' },
      { type: 'image', data: a.base64, mimeType: a.mimeType },
      { type: 'text', text: '[2] New (b):' },
      { type: 'image', data: b.base64, mimeType: b.mimeType },
    ];
    if (diff) {
      content.push({ type: 'text', text: '[3] Pixel-diff overlay (red = changed pixels):' });
      content.push({ type: 'image', data: diff.base64, mimeType: diff.mimeType });
    }

    return { content };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
