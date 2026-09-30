## Getting Started

```bash
npm install && npm install --prefix server
npm run dev            # vite dev server, with hot reload
node server/index.js   # /lab backend on :4000
```

## Deploying

Serve the **built** app, not the dev server:

```bash
npm install && npm install --prefix server
npm run build                       # emits dist/
node server/index.js &              # /lab backend on :4000
npm run preview -- --host --port 80 # serves dist/ + proxies /api, /nala, /lab
```

`npm run dev` on port 80 also works, but it ships unbundled source: every
module is a separate request and nothing is minified or cached, which is the
single biggest cause of slow page loads. `vite preview` serves the same
hashed, minified, long-cacheable bundles the build produces, and
`vite.config.js` gives `preview` the same `/api`, `/nala` and `/lab` proxies
as `dev` (Vite keeps `server.proxy` and `preview.proxy` separate, so they must
be shared explicitly — they are).

The backend also serves `/lab/thumb`, which downscales the 1-2 MB full-page
screenshots into the few-KB previews the viewer's snapshot list renders, and
caches them under `server/.thumb-cache/`. That directory is disposable; delete
it to reclaim disk.

## Run Console

`/console` dispatches and live-tracks the screenshot-diff workflows. Four run
kinds: **Viewport diff** (a dataset), **⚡ Quick run** (pasted URLs),
**🎨 Figma compare** (one page region vs one Figma frame) and
**Real iOS · Simulator**. It needs the `server/` backend running — see
[LAB.md](./LAB.md) for setup, the workflow dispatch fields and the results
contract.

Results are viewed at `/imagediff/<site>` (latest) or
`/imagediff/<site>?run=<runId>` (one specific run). Published results are pruned
upstream: dataset runs keep the newest 3 for up to 7 days, and quick / Figma runs
last 24 hours.

## Runners

`/runners` (backed by `GET /lab/runners`) shows the self-hosted Mac mini pool:
which runner is busy and on what job, each runner's last job, jobs still waiting
for a runner, and recent jobs from the last 24 hours. It refreshes every 15s;
the backend caches for 20s and keeps jobs of completed runs in memory.

Online/idle/offline status for every registered runner comes from the GitHub
runners API, which needs the backend's `GITHUB_TOKEN` to have **Administration:
Read** (fine-grained PAT) or admin access (classic PAT) on the workflow repo.
Without it, the page still works from job history: it lists runners that ran a
job in the last 14 days (with "last seen"), but can't show online vs offline or
runners that have been silent longer than that.

Some Mac minis are registered under their hostname (`sj1010122072235`) and carry
their `MacNodeXX` name as a runner label. With runners-API access the page shows
that label as the name (hostname underneath). Otherwise set the mapping in the
backend env (`RUNNER_ALIASES=host=Name,...`); the current four sj hosts are built in (226→MacNode03, 231→MacNode05, 234→MacNode07, 235→MacNode08).

### Backend tests

```bash
node --test server/*.test.js
```

## AI Judge

The "🤖 AI Judge" button in the screenshot-diff viewer asks a vision model
whether a diff is a real regression or harmless noise (carousel frames,
timestamps, rotating promos, mid-animation states).

If the Ask agent's `AI_FOUNDRY_API_KEY` is set, the judge uses it with the AI
Foundry gateway and the vision-capable `aifoundry/Qwen/Qwen-latest` (same model as the Ask agent)
(override with `AI_JUDGE_MODEL`) — nothing else to configure. Otherwise it calls
whatever OpenAI- or Anthropic-compatible endpoint you configure:

| Variable | Required | Notes |
| --- | --- | --- |
| `AI_JUDGE_API_KEY` | no* | *Required unless `AI_FOUNDRY_API_KEY` is set. Its presence is what "configured" means. Endpoints without real auth (e.g. a self-hosted proxy) still need a non-empty placeholder. |
| `AI_JUDGE_PROVIDER` | no | `openai` (default) or `anthropic` — selects the wire format. |
| `AI_JUDGE_BASE_URL` | no | Override the endpoint, e.g. Azure OpenAI or an OpenAI-compatible proxy. |
| `AI_JUDGE_MODEL` | no | Defaults to `gpt-4o-mini` / `claude-3-5-haiku-latest`. Must be **vision-capable**. |

Restart the backend after setting these. Unconfigured, `/lab/judge` returns a
friendly explanation rather than an error, and the button still renders.

### What the model actually sees

Full-page captures can run to ~7000px tall, and vision models downscale them
far enough to erase the copy and layout details the judge is meant to catch.
So the browser crops full-width strips around the detected diff hotspots and
sends only those — for baseline, new, and the diff overlay — each labelled
with its vertical pixel range. Crops keep native width up to 2000px.

When no hotspots are available (a MATCH snapshot, or a failed diff scan) the
server falls back to fetching the whole pages from S3.

> Screenshots are fetched from internal storage and forwarded to whichever
> endpoint you configure. Confirm that egress is acceptable before pointing
> this at a third-party or self-hosted model.

## Ask agent

The floating **✦ Ask** button (bottom right, on every page) opens a chat panel
that answers questions about this console's own data — recent runs, Brand
Concierge monitor checks and screenshot-diff results.

It is **read-only**: the model can call four tools (`list_runs`,
`list_datasets`, `get_dataset_results`, `get_bc_monitor`) and nothing else. It
cannot start, stop or change a run.

The default target is Adobe's internal AI Foundry gateway
(<https://aifoundry-preview.corp.adobe.com>), which is a plain
OpenAI-compatible LiteLLM proxy. Generate a personal virtual key (`sk-…`)
there, then configure the backend:

| Variable | Required | Notes |
| --- | --- | --- |
| `AI_FOUNDRY_API_KEY` | yes | Your AI Foundry virtual key. Its presence is what "configured" means. |
| `AI_FOUNDRY_BASE_URL` | no | Defaults to `https://apigw.infra.adobe.net/ehl/api/v1/ehl/v1`. Any OpenAI-compatible base URL works. |
| `AI_FOUNDRY_MODEL` | no | Defaults to `aifoundry/Qwen/Qwen-latest`. `hosted_vllm/google/gemma-4-26B-A4B-it` is cheaper. |

```bash
AI_FOUNDRY_API_KEY=sk-... node server/index.js
```

The key lives only on the backend — the browser only ever talks to `/lab/ask`.
Unconfigured, that route returns a friendly explanation (HTTP 200) rather than
an error, and the panel still renders and says what to set.

> Questions and the tool results they pull in (run ids, dataset names, BC check
> outcomes) are sent to the configured model. Keep this pointed at an internal
> gateway.
## Brand Concierge agent

**💬 BC workflow** (`/bc-agent`) accepts any HTTP(S) page containing Brand
Concierge and dispatches `brand-concierge-agent.yml` through the same GitHub
Actions + self-hosted Mac mini path as Screenshot Diff. The workflow runs the
standard conversation health check and uploads a shareable Markdown/JSON
summary, full HTML transcript and screenshots as a seven-day artifact. See
[LAB.md](LAB.md#brand-concierge-workflow).
