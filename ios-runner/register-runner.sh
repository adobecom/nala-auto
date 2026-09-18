#!/usr/bin/env bash
# Register this Mac as a GitHub Actions self-hosted runner for JackySun9/milo.
# Run ON the mini, in a logged-in GUI session (as `auto`), so the runner's
# LaunchAgent has GUI access (needed later for iOS Simulators).
#
#   ./register-runner.sh <REG_TOKEN> [name] [labels]
#
# Get <REG_TOKEN> (short-lived) from:
#   https://github.com/JackySun9/milo/settings/actions/runners  -> New self-hosted runner
#
# Defaults: name = this host's short name, labels = screendiff (joins the pool).
# For iOS-capable machines (Xcode installed) use labels "screendiff,ios-sim".
set -euo pipefail

TOKEN="${1:?usage: register-runner.sh <REG_TOKEN> [name] [labels]}"
NAME="${2:-$(scutil --get LocalHostName 2>/dev/null || hostname -s)}"
LABELS="${3:-screendiff}"
URL="https://github.com/JackySun9/milo"

DIR="$HOME/actions-runner-${NAME}"
mkdir -p "$DIR" && cd "$DIR"

# Download the runner if this dir doesn't already have it.
if [ ! -f ./config.sh ]; then
  arch=$([ "$(uname -m)" = "arm64" ] && echo arm64 || echo x64)   # Intel minis -> x64
  ver=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest \
        | grep -o '"tag_name": *"v[^"]*"' | head -1 | sed 's/.*"v//;s/"//')
  echo "Downloading actions-runner v${ver} (osx-${arch})…"
  curl -fsSL -o runner.tar.gz \
    "https://github.com/actions/runner/releases/download/v${ver}/actions-runner-osx-${arch}-${ver}.tar.gz"
  tar xzf runner.tar.gz && rm runner.tar.gz
fi

./config.sh --url "$URL" --token "$TOKEN" --name "$NAME" --labels "$LABELS" --unattended --replace
./svc.sh install
./svc.sh start

echo "✅ Registered '$NAME' with labels [$LABELS] as a LaunchAgent service."
echo "   Verify at: $URL/settings/actions/runners"
