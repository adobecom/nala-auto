#!/bin/bash
# One-time setup, run with sudo by an administrator on the dedicated Mac:
#   sudo ./install-manual-ios-user.sh /path/to/agent.env
#
# Runs the agent (and therefore Simulator.app) in the manual-ios user's desktop,
# which is what browser users see after signing in through the web Viewer.
# Code lives in /Users/Shared/nala-manual-ios so an administrator can deploy
# updates without SSH access as manual-ios; the agent restarts itself when
# manual-ios-agent.mjs changes.
set -euo pipefail

ENV_SOURCE="${1:?usage: sudo $0 /path/to/agent.env}"
TARGET_USER="${MANUAL_IOS_USER:-manual-ios}"
SHARED="${MANUAL_IOS_SHARED_DIR:-/Users/Shared/nala-manual-ios}"
LABEL="com.adobe.nala-manual-ios.agent"

[ "$(id -u)" = 0 ] || { echo "Run with sudo." >&2; exit 1; }
TARGET_UID="$(id -u "$TARGET_USER")"
TARGET_HOME="$(dscl . -read "/Users/$TARGET_USER" NFSHomeDirectory | awk '{print $2}')"
for file in manual-ios-agent.mjs start-agent.sh node; do
  [ -e "$SHARED/$file" ] || { echo "Missing $SHARED/$file" >&2; exit 1; }
done

install -d -o "$TARGET_USER" -g staff -m 700 "$TARGET_HOME/.nala-manual-ios"
install -o "$TARGET_USER" -g staff -m 600 "$ENV_SOURCE" "$TARGET_HOME/.nala-manual-ios/agent.env"
install -d -o "$TARGET_USER" -g staff -m 755 "$SHARED/logs"
install -d -o "$TARGET_USER" -g staff -m 755 "$TARGET_HOME/Library/LaunchAgents"

PLIST="$TARGET_HOME/Library/LaunchAgents/$LABEL.plist"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$SHARED/start-agent.sh</string></array>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$SHARED/logs/agent.log</string>
  <key>StandardErrorPath</key><string>$SHARED/logs/agent.error.log</string>
</dict>
</plist>
PLIST
chown "$TARGET_USER:staff" "$PLIST"
chmod 644 "$PLIST"

if launchctl print "gui/$TARGET_UID" >/dev/null 2>&1; then
  launchctl bootout "gui/$TARGET_UID/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$TARGET_UID" "$PLIST"
  echo "Agent started in $TARGET_USER's desktop session."
else
  echo "$TARGET_USER is not logged in; the agent starts at their next login."
fi
