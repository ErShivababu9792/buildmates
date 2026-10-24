import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { app, db } from '../firebase';

/**
 * Phone / desktop notifications through Firebase Cloud Messaging (free).
 * The token for this device is saved in pushTokens/{uid}; the server sends pushes to it.
 * Works in the built app (npm run build + preview, or the live site), because it needs the service worker.
 */
const VAPID = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
const KEY = 'bm_push_token';
const MAX_DEVICES = 5;

export const pushConfigured = Boolean(VAPID);

const readLocal = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const writeLocal = (v) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* storage blocked */ } };

/** 'unsupported' | 'not-setup' | 'needs-build' | 'blocked' | 'on' | 'off' */
export async function pushState() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (!pushConfigured) return 'not-setup';
  const { isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return 'unsupported';
  if (!(await navigator.serviceWorker.getRegistration())) return 'needs-build';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && readLocal() ? 'on' : 'off';
}

async function saveTokens(uid, update) {
  const ref = doc(db, 'pushTokens', uid);
  const snap = await getDoc(ref).catch(() => null);
  const now = snap?.exists() ? (snap.data().tokens || []) : [];
  const tokens = update(now).slice(-MAX_DEVICES);
  await setDoc(ref, { tokens, updatedAt: serverTimestamp() });
}

export async function enablePush(uid) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings for this site.');
  const reg = await navigator.serviceWorker.ready;
  const { getMessaging, getToken } = await import('firebase/messaging');
  const token = await getToken(getMessaging(app), { vapidKey: VAPID, serviceWorkerRegistration: reg });
  if (!token) throw new Error('Could not turn on notifications. Try again.');
  await saveTokens(uid, (list) => [...list.filter((t) => t !== token), token]);
  writeLocal(token);
}

export async function disablePush(uid) {
  const token = readLocal();
  try {
    const { deleteToken, getMessaging } = await import('firebase/messaging');
    await deleteToken(getMessaging(app));
  } catch { /* already gone */ }
  if (token) await saveTokens(uid, (list) => list.filter((t) => t !== token));
  writeLocal('');
}
