import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { exactPosition } from './geo';

/**
 * Safety location: the exact point from the browser's own "Allow location" pop-up,
 * saved to locations/{uid}. Only the student and BuildMates admins can read it (firestore.rules).
 * Other students only ever see the area name (and a ~1 km point used for distance).
 */
export function saveExact(uid, exact) {
  if (!uid || !exact || !Number.isFinite(exact.lat) || !Number.isFinite(exact.lng)) return Promise.resolve();
  return setDoc(doc(db, 'locations', uid), {
    lat: exact.lat, lng: exact.lng, accuracy: Math.max(0, Math.min(100000, exact.accuracy || 0)), at: serverTimestamp(),
  }).catch(() => {});
}

const KEY = 'bm_loc_at';
const DAY = 24 * 60 * 60 * 1000;

const ASKED = 'bm_loc_asked';

/**
 * On sign-in: refresh the safety location (at most once a day).
 * Already allowed → quietly. Not asked yet on this device → the browser's own "Allow location" pop-up, once.
 * Blocked → nothing (the student can still use pincode).
 */
export async function refreshExactIfAllowed(uid) {
  try {
    if (!uid || !navigator.permissions || !navigator.geolocation) return;
    const last = Number(localStorage.getItem(KEY) || 0);
    if (Date.now() - last < DAY) return;
    const p = await navigator.permissions.query({ name: 'geolocation' });
    if (p.state === 'denied') return;
    if (p.state === 'prompt') {
      if (localStorage.getItem(ASKED)) return;
      localStorage.setItem(ASKED, '1');
    }
    const exact = await exactPosition();
    await saveExact(uid, exact);
    localStorage.setItem(KEY, String(Date.now()));
  } catch { /* best effort */ }
}
