#!/usr/bin/env bash
# Manage the iOS Simulator version matrix for nala-auto's real-iOS jobs.
# This is the "conveniently pick any iOS version" mechanic, concretely:
#   list   — show installed iOS runtimes
#   ensure — install a runtime if missing        ./simulators.sh ensure 17.5
#   create — create + boot a device, prints UDID  ./simulators.sh create "iPhone 15" 17.5
#   erase  — reset a device to clean state         ./simulators.sh erase <udid>
set -euo pipefail

cmd="${1:-list}"
case "$cmd" in
  list)
    xcrun simctl list runtimes | grep -i iOS || echo "no iOS runtimes installed"
    ;;
  ensure)
    ver="${2:?usage: ensure <iosVersion>}"
    if xcrun simctl list runtimes | grep -qi "iOS ${ver}"; then
      echo "iOS ${ver} already installed"
    else
      echo "downloading iOS ${ver} runtime…"
      xcodebuild -downloadPlatform iOS -buildVersion "${ver}"
    fi
    ;;
  create)
    dev="${2:?usage: create <device> <iosVersion>}"
    ver="${3:?usage: create <device> <iosVersion>}"
    udid=$(xcrun simctl create "nala-${dev// /_}-${ver}" "${dev}" "iOS ${ver}")
    xcrun simctl boot "${udid}"
    echo "${udid}"
    ;;
  erase)
    xcrun simctl erase "${2:?usage: erase <udid>}"
    ;;
  *)
    echo "usage: $0 {list|ensure <ver>|create <device> <ver>|erase <udid>}"
    exit 1
    ;;
esac
