#!/usr/bin/env python3
"""Return the console to the macOS login window (fast user switching).

Run at login of the auto-login service account so the web Viewer never exposes
that account's desktop; Viewer users then sign in as manual-ios.
"""
import ctypes
import time

time.sleep(15)
ctypes.CDLL("/System/Library/PrivateFrameworks/login.framework/Versions/Current/login").SACSwitchToLoginWindow()
