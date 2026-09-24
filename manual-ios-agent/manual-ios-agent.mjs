#!/usr/bin/env node
/* global process, Buffer */
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const port = Number(process.env.MANUAL_IOS_AGENT_PORT || 4380);
const token = process.env.MANUAL_IOS_AGENT_TOKEN || '';
const viewerUrl = process.env.MANUAL_IOS_VIEWER_URL || '';
let active = null;
let expiryTimer = null;

if (!token || !viewerUrl) {
  throw new Error('Set MANUAL_IOS_AGENT_TOKEN and MANUAL_IOS_VIEWER_URL before starting the agent.');
}

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function simctl(...args) {
  return exec('xcrun', ['simctl', ...args]);
}

async function launchSimulator(udid) {
  await exec('osascript', ['-e', 'tell application id "com.apple.iphonesimulator" to quit']).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  await exec('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', udid]);
}

async function createSession({ sessionId, device, iosVersion, url }) {
  if (!sessionId || !device || !iosVersion || !url) throw new Error('sessionId, device, iosVersion, and url are required.');
  const target = new URL(url);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('URL must use http or https.');
  if (active) throw new Error('A manual session is already active on this Mac.');
  const runtimes = JSON.parse((await simctl('list', 'runtimes', '--json')).stdout).runtimes;
  const runtime = runtimes.find((item) => item.isAvailable && item.name === `iOS ${iosVersion}`);
  if (!runtime) throw new Error(`iOS ${iosVersion} runtime is not installed on this Mac.`);
  const deviceTypes = JSON.parse((await simctl('list', 'devicetypes', '--json')).stdout).devicetypes;
  const deviceType = deviceTypes.find((item) => item.name === device);
  if (!deviceType) throw new Error(`${device} is not available on this Mac.`);

  const name = `nala-manual-${sessionId}`;
  const udid = (await simctl('create', name, deviceType.identifier, runtime.identifier)).stdout.trim();
  try {
    await simctl('boot', udid);
    await launchSimulator(udid);
    await simctl('openurl', udid, target.href);
  } catch (error) {
    await simctl('delete', udid).catch(() => {});
    throw error;
  }
  active = { id: sessionId, udid };
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  expiryTimer = setTimeout(() => endSession(sessionId).catch(() => {}), expiresAt.getTime() - Date.now());
  return {
    id: sessionId,
    viewerUrl,
    expiresAt: expiresAt.toISOString(),
  };
}

async function endSession(id) {
  if (!active || active.id !== id) throw new Error('Manual session not found.');
  const { udid } = active;
  active = null;
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  await exec('osascript', ['-e', 'tell application id "com.apple.iphonesimulator" to quit']).catch(() => {});
  await simctl('shutdown', udid).catch(() => {});
  await simctl('delete', udid).catch(() => {});
}

http.createServer(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { error: 'unauthorized' });
  try {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { active: Boolean(active) });
    if (req.method === 'POST' && req.url === '/sessions') return send(res, 201, await createSession(await body(req)));
    const match = req.url.match(/^\/sessions\/([^/]+)$/);
    if (req.method === 'DELETE' && match) {
      await endSession(decodeURIComponent(match[1]));
      return send(res, 204, {});
    }
    return send(res, 404, { error: 'not found' });
  } catch (error) {
    return send(res, 400, { error: error.message });
  }
}).listen(port, () => console.log(`manual iOS agent listening on :${port}`));
