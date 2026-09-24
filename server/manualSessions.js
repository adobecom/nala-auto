/* global process */
import { randomUUID } from 'node:crypto';

const AGENT_URL = (process.env.MANUAL_IOS_AGENT_URL || '').replace(/\/+$/, '');
const AGENT_TOKEN = process.env.MANUAL_IOS_AGENT_TOKEN || '';
const TTL_MINUTES = Math.max(5, Number(process.env.MANUAL_IOS_SESSION_TTL_MINUTES || 30));

let session = null;

function configured() {
  return Boolean(AGENT_URL && AGENT_TOKEN);
}

function clearExpiredSession() {
  if (session && new Date(session.expiresAt) <= new Date()) session = null;
}

function snapshot() {
  clearExpiredSession();
  return session && { ...session };
}

async function agent(path, options = {}) {
  const response = await fetch(`${AGENT_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${AGENT_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `manual iOS agent failed (${response.status})`);
  return body;
}

export function manualSessionConfig() {
  return {
    enabled: configured(),
    ttlMinutes: TTL_MINUTES,
    session: snapshot(),
  };
}

export async function createManualSession({ device, iosVersion, url, owner = 'console' } = {}) {
  if (!configured()) throw new Error('Manual iOS sessions are not configured on this server.');
  clearExpiredSession();
  if (session) {
    throw new Error('A manual iOS session is already in use. End it before starting another.');
  }
  const target = new URL(url);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Manual iOS URL must use http or https.');

  const sessionId = randomUUID();
  const result = await agent('/sessions', {
    method: 'POST',
    body: JSON.stringify({ sessionId, device, iosVersion, url: target.href }),
  });
  session = {
    id: result.id || sessionId,
    device,
    iosVersion,
    owner,
    viewerUrl: result.viewerUrl,
    startedAt: new Date().toISOString(),
    expiresAt: result.expiresAt || new Date(Date.now() + TTL_MINUTES * 60_000).toISOString(),
  };
  return snapshot();
}

export async function endManualSession(id) {
  clearExpiredSession();
  if (!session || session.id !== id) throw new Error('Manual iOS session not found.');
  try {
    await agent(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (error) {
    if (error.message !== 'Manual iOS session not found.') throw error;
  }
  session = null;
}
