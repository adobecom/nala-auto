# Manual iOS agent

Run this on one dedicated macOS machine that has Xcode, the requested Simulator runtimes, and a noVNC gateway exposing that Mac's logged-in desktop. Do not install it on a GitHub Actions runner shared with automated jobs.

```sh
export MANUAL_IOS_AGENT_TOKEN='generate-a-long-random-secret'
export MANUAL_IOS_VIEWER_URL='https://manual-ios.example.corp/vnc.html'
node manual-ios-agent.mjs
```

`MANUAL_IOS_VIEWER_URL` must be the authenticated noVNC page for this Mac. The agent listens only for the nala-auto backend, protected by the bearer token. Restrict its port to the backend network and terminate TLS at the internal proxy.

Configure the nala-auto backend with the same token:

```sh
export MANUAL_IOS_AGENT_URL='http://manual-ios-mac.example.corp:4380'
export MANUAL_IOS_AGENT_TOKEN='generate-a-long-random-secret'
export MANUAL_IOS_SESSION_TTL_MINUTES=30
```

The agent permits one session at a time. It creates an ephemeral Simulator, opens Safari at the requested URL, and deletes that Simulator when the session ends or after 30 minutes. Use a process supervisor to restart the agent after host maintenance.
