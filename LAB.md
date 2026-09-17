# nala-auto Run Console (Lab)

Turns nala-auto from a **results dashboard** into a **BrowserStack-style console**: pick a
site + candidate, click **Run**, and watch the `screenshot-diff-nala-parallel.yml` GitHub Actions
workflow dispatch and stream its parallel shards live — then jump straight to the results.

Today it drives the **existing** workflow (self-hosted macOS runners → S3 → `/imagediff/{site}`).
The UI already shows the **v2** slot for a real iOS Simulator version matrix (see roadmap below).

## Pieces added

| Path | What |
|------|------|
| `server/` | Thin Node backend (only dep: `ws`). Holds the GitHub token, dispatches + polls the workflow, streams status over WebSocket. Namespaced under `/lab`. |
| `src/pages/RunConsolePage.jsx` | The `/console` page: site picker, candidate input, Run button, live job grid. |
| `vite.config.js` | Adds a `/lab` → `localhost:4000` proxy (with `ws: true`). |
| `ios-runner/` | v2 real-iOS engine: Appium capture (`run.mjs`), sim-matrix helper (`simulators.sh`), site→URL seam (`site-urls.mjs`), and the `run-nala-ios.yml` workflow template. |

No secrets live in the frontend — the token is only ever read by the backend.

## Run it (mock mode — no token, works right now)

```bash
# terminal 1 — backend (simulated runs)
cd server && npm install && npm start

# terminal 2 — frontend
npm install && npm run dev
```

Open the app → **Run Console** (or `/console`). With no token the backend runs in **MOCK**
mode: it simulates the chrome / ipad / iphone shards so you can see the whole UX end to end.

## Go live (dispatch the real workflow)

Give the backend a GitHub token and it flips to **LIVE**:

```bash
cd server
GITHUB_TOKEN=ghp_xxx \
GH_OWNER=JackySun9 \
GH_REPO=milo \
GH_WORKFLOW=screenshot-diff-nala-parallel.yml \
GH_REF=main \
npm start
```

**Token scope**
- Fine-grained PAT on the repo → **Actions: Read and write** (Metadata: Read is automatic).
- Classic PAT → `repo` + `workflow`.

**Env vars** (all optional except the token): `GH_OWNER`, `GH_REPO`, `GH_WORKFLOW`, `GH_REF`,
`LAB_PORT` (default 4000), `NALA_AUTO_BASE` (default `http://nala-auto.corp.adobe.com`).

### How LIVE works
1. `POST /lab/runs` → `POST /actions/workflows/{wf}/dispatches` with `{ site, milo_libs }`.
2. Dispatch returns `204` with no run id, so the backend polls
   `/actions/workflows/{wf}/runs?event=workflow_dispatch` and picks the run created just after.
   *Caveat:* if several dispatches fire within the same few seconds it may attach to the wrong one —
   fine for interactive use; add a correlation input if you automate it.
3. It then polls the run + its jobs every 4s and pushes each update over `/lab/stream`.

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/lab/config` | mode, repo/workflow, site list, shards, defaults |
| POST | `/lab/runs` | `{ site, milolibs }` → `{ runId, mode, resultsUrl }` |
| GET | `/lab/runs/:id` | current snapshot |
| WS | `/lab/stream?runId=` | live `{ kind: 'update', ... }` snapshots |

## v2 — real iOS Simulator matrix (scaffolded)

The real reason for this project: replace BrowserStack's **real iOS** coverage with **iOS
Simulators** on the Mac minis — the version matrix is nearly free. The console's **Real iOS ·
Simulator** tab dispatches a second workflow (`run-nala-ios.yml`) with a `device` + `ios_versions`
matrix; picker, dispatch, live tracking and results view are all reused unchanged.

Playwright can't drive real iOS Safari — that layer is **Appium (XCUITest)**, which is what
`ios-runner/run.mjs` uses.

### What's runnable now
```bash
# on a Mac mini with Xcode installed
cd ios-runner && npm install
./simulators.sh ensure 17.5                 # download the runtime if missing
npm i -g appium && appium driver install xcuitest
appium &                                    # start the server
LAB_DEVICE="iPhone 15" LAB_VERSION="17.5" \
LAB_URLS='["https://www.adobe.com"]' LAB_OUT=./out \
  node run.mjs                              # → real Mobile Safari screenshot in ./out
```

### Clean state per run (no VM needed)
Each iOS job provisions a **fresh Simulator** (`simulators.sh fresh` → `simctl create`+boot) and
deletes it afterward (`simulators.sh rm`, with `if: always()`), so every run starts factory-clean —
no cookies, cache or Safari state carried over. That's the simulator equivalent of BrowserStack's
fresh-device sessions; a full macOS VM is unnecessary (you're screenshotting public pages, not
running untrusted code). Host macOS is shared across jobs (fine for web capture). For concurrency
on one mini, give each parallel runner its own Appium port (`APPIUM_PORT`) — the fresh device name
is already unique per job.

Fastest way to prep a mini: `./ios-runner/setup-mini.sh 17.5 18.0` (run it in a logged-in GUI
session — Simulators need an Aqua session, not a daemon).

### Wiring it into CI
1. Copy `ios-runner/run-nala-ios.yml` → `<milo>/.github/workflows/`, and vendor the `ios-runner/`
   folder into that repo (or add a checkout step).
2. Label your Simulator-capable Mac minis `[self-hosted, macOS, ios-sim]`.
3. Set `GITHUB_TOKEN` on the backend → the console's **Real iOS** tab dispatches it live.

### Remaining integration seam
- `site-urls.mjs` scrapes `nala/features/visual/sot.<site>.yml` when present, else falls back to a
  demo URL — point it at your real per-site list.
- The **S3 upload** step is a disabled placeholder: wire it to your existing
  `tools/screenshot-diff/lib/upload-one.js` so iOS shots land in the `results.json` format
  `/imagediff/<site>` already renders.
