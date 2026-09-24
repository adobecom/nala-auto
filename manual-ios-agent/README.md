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

## Passwordless noVNC viewer

To avoid showing the macOS Screen Sharing password to browser users, run
`rfb-bridge.py` on the same Mac. It authenticates to local Screen Sharing with
a VNC password stored in a `chmod 600` file, then offers noVNC an
unauthenticated RFB endpoint on `127.0.0.1:5901`. Point websockify at that
endpoint instead of `127.0.0.1:5900`.

This requires an administrator to enable **legacy VNC password authentication**
on the dedicated Mac:

```sh
# Create an 8-character secret without echoing it. The legacy VNC protocol
# limits passwords to eight characters; the file must remain local to the Mac.
umask 077
LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 8 > ~/manual-ios-pilot/vnc-password

# Do not put this secret in Git, a browser URL, or JavaScript.
sudo ./configure-legacy-vnc.sh /Users/auto/manual-ios-pilot/vnc-password
```

`configure-legacy-vnc.sh` also removes `manual-ios` from the macOS `admin`
group. Restrict TCP/5900 to loopback with the host firewall; only the local
bridge should reach Screen Sharing. The browser-facing noVNC endpoint stays on
port 6080 and talks only to the bridge at `127.0.0.1:5901`.
