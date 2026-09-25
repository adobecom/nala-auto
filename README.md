## Getting Started

Run npm install && npm run dev to start.

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