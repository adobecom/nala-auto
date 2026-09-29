## Getting Started

Run npm install && npm run dev to start.

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

### Backend tests

```bash
node --test server/*.test.js
```

## AI Judge

The "🤖 AI Judge" button in the screenshot-diff viewer asks a vision model
whether a diff is a real regression or harmless noise (carousel frames,
timestamps, rotating promos, mid-animation states).

No model or key ships with this repo. The backend calls whatever
OpenAI- or Anthropic-compatible endpoint you configure:

| Variable | Required | Notes |
| --- | --- | --- |
| `AI_JUDGE_API_KEY` | yes | Its presence is what "configured" means. Endpoints without real auth (e.g. a self-hosted proxy) still need a non-empty placeholder. |
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
## Brand Concierge agent

**💬 BC workflow** (`/bc-agent`) accepts any HTTP(S) page containing Brand
Concierge and dispatches `brand-concierge-agent.yml` through the same GitHub
Actions + self-hosted Mac mini path as Screenshot Diff. The workflow runs the
standard conversation health check and uploads a shareable Markdown/JSON
summary, full HTML transcript and screenshots as a seven-day artifact. See
[LAB.md](LAB.md#brand-concierge-workflow).
