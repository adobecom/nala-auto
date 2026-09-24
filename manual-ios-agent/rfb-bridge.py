#!/usr/bin/env python3
"""Authenticate to a legacy VNC server once, then relay an unauthenticated RFB session.

This listens on loopback only. noVNC connects to this bridge, while the bridge
uses the VNC password kept in a local file to authenticate to Screen Sharing.
The password is never sent to the browser.
"""
import asyncio
import os
import subprocess
import sys

LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = int(os.environ.get("MANUAL_IOS_RFB_BRIDGE_PORT", "5901"))
VNC_HOST = os.environ.get("MANUAL_IOS_VNC_HOST", "127.0.0.1")
VNC_PORT = int(os.environ.get("MANUAL_IOS_VNC_PORT", "5900"))
PASSWORD_FILE = os.environ.get("MANUAL_IOS_VNC_PASSWORD_FILE", "")


async def read_exact(reader, count):
    return await reader.readexactly(count)


def reverse_bits(value):
    return int(f"{value:08b}"[::-1], 2)


def vnc_response(challenge, password):
    key = bytes(reverse_bits(char) for char in password.encode("utf-8")[:8].ljust(8, b"\0"))
    result = subprocess.run(
        ["openssl", "enc", "-des-ecb", "-nosalt", "-nopad", "-K", key.hex()],
        input=challenge,
        capture_output=True,
        check=True,
    )
    return result.stdout


def password():
    if not PASSWORD_FILE:
        raise RuntimeError("MANUAL_IOS_VNC_PASSWORD_FILE is not configured")
    with open(PASSWORD_FILE, "r", encoding="utf-8") as handle:
        return handle.read().strip()


async def authenticate_upstream():
    upstream_reader, upstream_writer = await asyncio.open_connection(VNC_HOST, VNC_PORT)
    version = await read_exact(upstream_reader, 12)
    if not version.startswith(b"RFB "):
        raise RuntimeError("unexpected VNC server version")
    upstream_writer.write(version)
    await upstream_writer.drain()

    count = (await read_exact(upstream_reader, 1))[0]
    types = await read_exact(upstream_reader, count)
    if 2 not in types:
        raise RuntimeError(f"VNC server must enable legacy VNC password authentication (security types: {list(types)})")
    upstream_writer.write(b"\x02")
    await upstream_writer.drain()

    challenge = await read_exact(upstream_reader, 16)
    upstream_writer.write(vnc_response(challenge, password()))
    await upstream_writer.drain()
    result = int.from_bytes(await read_exact(upstream_reader, 4), "big")
    if result:
        reason = ""
        try:
            reason_length = int.from_bytes(await read_exact(upstream_reader, 4), "big")
            reason = (await read_exact(upstream_reader, reason_length)).decode("utf-8", "replace")
        except asyncio.IncompleteReadError:
            pass
        raise RuntimeError(f"VNC authentication failed: {reason or result}")
    return upstream_reader, upstream_writer


async def relay(source, destination):
    try:
        while data := await source.read(65536):
            destination.write(data)
            await destination.drain()
    finally:
        destination.close()


async def handle(client_reader, client_writer):
    upstream_writer = None
    try:
        client_writer.write(b"RFB 003.008\n")
        await client_writer.drain()
        await read_exact(client_reader, 12)
        client_writer.write(b"\x01\x01")  # One supported security type: None.
        await client_writer.drain()
        if await read_exact(client_reader, 1) != b"\x01":
            raise RuntimeError("client did not select no-auth security")
        client_writer.write(b"\0\0\0\0")
        await client_writer.drain()

        upstream_reader, upstream_writer = await authenticate_upstream()
        client_init = await read_exact(client_reader, 1)
        upstream_writer.write(client_init)
        await upstream_writer.drain()

        server_init = await read_exact(upstream_reader, 24)
        name_length = int.from_bytes(server_init[20:24], "big")
        client_writer.write(server_init + await read_exact(upstream_reader, name_length))
        await client_writer.drain()

        await asyncio.gather(
            relay(client_reader, upstream_writer),
            relay(upstream_reader, client_writer),
        )
    except Exception as error:
        print(f"RFB bridge error: {error}", file=sys.stderr)
    finally:
        if upstream_writer:
            upstream_writer.close()
            await upstream_writer.wait_closed()
        client_writer.close()
        await client_writer.wait_closed()


async def main():
    password()
    server = await asyncio.start_server(handle, LISTEN_HOST, LISTEN_PORT)
    print(f"RFB bridge listening on {LISTEN_HOST}:{LISTEN_PORT}", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
