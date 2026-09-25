#!/bin/bash
# Launched by the manual-ios user's LaunchAgent inside that user's desktop session.
set -euo pipefail
cd "$(dirname "$0")"
set -a
source "$HOME/.nala-manual-ios/agent.env"
set +a
exec ./node manual-ios-agent.mjs
