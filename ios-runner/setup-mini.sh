#!/usr/bin/env bash
# Prepare a Mac mini to run nala-auto's real-iOS jobs.
#
# Run this ON the mini, inside a LOGGED-IN GUI session (Simulators need an Aqua
# session — do not run it over a plain SSH/daemon context).
#
#   ./setup-mini.sh [iosVersion ...]      # default: 17.5 18.0
#
# PREREQUISITE (must be done first, needs sudo + Apple ID / App Store / MDM):
#   Install full Xcode, then:
#     sudo xcode-select -s /Applications/Xcode.app
#     sudo xcodebuild -license accept && sudo xcodebuild -runFirstLaunch
#
# This script is brew-free: Node comes from nvm (no sudo). It installs Appium +
# the XCUITest driver, downloads the requested iOS runtimes, and smoke-tests a
# fresh Simulator -> real Mobile Safari -> screenshot.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

VERSIONS=("$@")
[ ${#VERSIONS[@]} -eq 0 ] && VERSIONS=(17.5 18.0)

echo "== 1/6 Xcode =="
if ! xcode-select -p 2>/dev/null | grep -q "Xcode.app"; then
  echo "!! Full Xcode not found. Install it first (App Store / MDM Self Service / xcodes), then:"
  echo "     sudo xcode-select -s /Applications/Xcode.app"
  echo "     sudo xcodebuild -license accept && sudo xcodebuild -runFirstLaunch"
  exit 1
fi
sudo xcodebuild -license accept || true
xcodebuild -runFirstLaunch || true
echo "   $(xcodebuild -version | head -1)"

echo "== 2/6 Node (via nvm, no sudo) =="
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] || curl -fsSL -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  . "$NVM_DIR/nvm.sh"
  nvm install 20
fi
echo "   node $(node -v)  npm $(npm -v)"

echo "== 3/6 optional brew tools =="
if command -v brew >/dev/null 2>&1; then
  brew install jq carthage ios-webkit-debug-proxy || true
else
  echo "   no Homebrew — skipping (not required for Simulator Safari; jq: $(command -v jq || echo absent))"
fi

echo "== 4/6 Appium + XCUITest driver =="
npm i -g appium
appium driver install xcuitest 2>/dev/null || appium driver update xcuitest || true
appium driver doctor xcuitest || true

echo "== 5/6 iOS runtimes: ${VERSIONS[*]} =="
for v in "${VERSIONS[@]}"; do "$HERE/simulators.sh" ensure "$v" || true; done

echo "== 6/6 smoke test (fresh sim -> real Safari screenshot) =="
(cd "$HERE" && npm install)
ver="${VERSIONS[0]}"
udid="$("$HERE/simulators.sh" fresh "iPhone 15" "$ver")"
appium >/tmp/nala-appium.log 2>&1 & appium_pid=$!
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:4723/status >/dev/null 2>&1 && break; sleep 1; done
LAB_DEVICE="iPhone 15" LAB_VERSION="$ver" LAB_UDID="$udid" \
  LAB_URLS='["https://www.adobe.com"]' LAB_OUT="$HERE/out" node "$HERE/run.mjs" || true
"$HERE/simulators.sh" rm "$udid" || true
kill "$appium_pid" 2>/dev/null || true

echo
echo "Done. Screenshot(s) in: $HERE/out"
echo "Next: register this mini as a GitHub Actions runner with label 'ios-sim'"
echo "      (JackySun9/milo -> Settings -> Actions -> Runners) and run it in THIS GUI session."
