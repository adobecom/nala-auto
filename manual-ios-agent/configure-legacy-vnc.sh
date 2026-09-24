#!/bin/bash
# Run once with sudo on the dedicated manual iOS Mac.
# The password file must be owned by the runner account and mode 600.
set -euo pipefail

PASSWORD_FILE="${1:?Usage: sudo $0 /absolute/path/to/vnc-password-file}"
if [[ ! -f "$PASSWORD_FILE" ]]; then
  echo "VNC password file not found: $PASSWORD_FILE" >&2
  exit 1
fi

VNC_PASSWORD="$(cat "$PASSWORD_FILE")"
if [[ ${#VNC_PASSWORD} -gt 8 || -z "$VNC_PASSWORD" ]]; then
  echo "macOS legacy VNC password must contain 1-8 characters." >&2
  exit 1
fi

KICKSTART="/System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart"

# This bridge is the only VNC client. Do not publish TCP/5900 outside the Mac.
"$KICKSTART" -configure \
  -clientopts -setvnclegacy -vnclegacy yes \
  -clientopts -setvncpw -vncpw "$VNC_PASSWORD"
"$KICKSTART" -restart -agent -console

# The dedicated account is used only for Screen Sharing; it must never be admin.
dseditgroup -o edit -d manual-ios -t user admin 2>/dev/null || true

echo "Legacy VNC password authentication enabled for the local RFB bridge."
