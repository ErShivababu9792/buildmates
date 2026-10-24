import { auth } from '../firebase';
import { AI_URL, aiEnabled } from './ai';

/**
 * Calls to the BuildMates server (same Python server as the AI API) for things that need trusted access:
 * parent approval email, college ID check and push notifications.
 * Errors come back with a readable message from the server.
 */
export const serverEnabled = aiEnabled;

async function request(path, { json, form, timeoutMs = 20000 } = {}) {
  if (!serverEnabled) throw new Error('The BuildMates server is not set up yet (VITE_AI_API_URL).');
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  const token = await user.getIdToken();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${AI_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
      body: json ? JSON.stringify(json) : form,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'The server could not do that. Try again.');
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The server is taking too long. It may be waking up, try again in a minute.');
    if (e instanceof TypeError) throw new Error('Could not reach the BuildMates server. Is it running?');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Emails the parent a link to approve an under-18 account. → { sent, to } */
export const sendParentEmail = () => request('/parent/send', { timeoutMs: 45000 });

/** Uploads a photo of the college ID card (kept private, deleted after the admin decides). */
export function uploadIdCard(blob) {
  const form = new FormData();
  form.append('file', blob, 'id.jpg');
  return request('/id/upload', { form, timeoutMs: 60000 });
}

/** Admin only: the ID photo as a data URL (never a shareable link). */
export const viewIdCard = (uid) => request('/id/view', { json: { uid } }).then((d) => d.dataUrl);

/** Admin only: approve gives the Verified badge; both choices delete the photo. */
export const decideIdCard = (uid, approve, reason = '') => request('/id/decide', { json: { uid, approve, reason } });

/**
 * Asks the server to send a phone notification to `target` about something we just did.
 * kind: 'message' (ref = chatId) | 'request' | 'invite' (ref = teamId) | 'meet' (ref = meetId)
 * Fire and forget: a missing push never breaks the main action.
 */
export function notifyPush(kind, target, ref = '') {
  if (!serverEnabled || !target) return;
  request('/push/notify', { json: { kind, target, ref }, timeoutMs: 15000 }).catch(() => {});
}

/* ---------- Phase 13 ---------- */
/** Admin only: numbers and funnel for the report (no chats or messages are read). */
export const adminStats = () => request('/admin/stats', { timeoutMs: 60000 });
/** The weekly email this user would get, as HTML. */
export const digestPreview = () => request('/digest/preview', { timeoutMs: 45000 });
/** Admin only: send the weekly digest to everyone who turned it on. */
export const digestSend = () => request('/digest/send', { timeoutMs: 120000 });
