import { auth } from '../firebase';

/** URL of the Python AI API. Leave empty in .env to run without it (the app falls back to built-in rules). */
export const AI_URL = (import.meta.env.VITE_AI_API_URL || '').replace(/\/+$/, '');
export const aiEnabled = Boolean(AI_URL);

async function call(path, body, timeoutMs) {
  if (!aiEnabled) throw new Error('AI API not configured');
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${AI_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`AI API ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Meaning of a text as 384 numbers. A sleeping free server can take ~30s to wake up. */
export async function embedText(text) {
  const { vector } = await call('/embed', { text }, 45000);
  return Array.isArray(vector) && vector.length === 384 ? vector : null;
}

/**
 * Trained Hinglish guard. Returns null if the API is slow or down, so the caller can fall back.
 * Short wait on purpose: chat must feel instant, and the built-in rules + database rules still apply.
 */
export async function guardRemote(text, timeoutMs = 1500) {
  try {
    return await call('/guard', { text }, timeoutMs);
  } catch (e) {
    console.warn('AI Guard unavailable:', e.message);
    return null;
  }
}

export async function ideaCheckRemote(idea) {
  try { return (await call('/idea-check', idea, 4000)).warnings; } catch { return null; }
}

/** Server-side check that a product link really opens (safe against private-network tricks). */
export async function checkLinkRemote(url) {
  try { return await call('/check-link', { url }, 12000); } catch { return null; }
}

export async function aiHealth() {
  if (!aiEnabled) return { ok: false, reason: 'not configured' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(`${AI_URL}/health`, { signal: ctrl.signal });
    return res.ok ? await res.json() : { ok: false, reason: `status ${res.status}` };
  } catch {
    return { ok: false, reason: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

/** Text we turn into a vector for matching: the vision plus interests and role. */
export function visionText(p) {
  return [p.vision, (p.interests || []).join(', '), p.role].filter(Boolean).join('. ');
}
