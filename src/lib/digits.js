import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Stops a phone number being sent in pieces ("98", "76", "54"...).
 * Every chat keeps a small "digit trail" per sender: the digits from their recent messages.
 * If the trail reaches 10 digits (a phone number) within an hour, the message is not sent.
 * The same check runs in firestore.rules, so it holds even if someone bypasses the app.
 * The hour restarts from the last message that had digits, so spacing the pieces out does not help.
 */
export const TRAIL_LIMIT = 10;
export const TRAIL_WINDOW_MS = 60 * 60 * 1000;

const INDIC_ZERO = [0x0966, 0x09E6, 0x0A66, 0x0AE6, 0x0B66, 0x0BE6, 0x0C66, 0x0CE6, 0x0D66]; // Devanagari … Malayalam
const WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  shunya: 0, sunya: 0, ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5, panj: 5,
  chhe: 6, chhah: 6, che: 6, cheh: 6, saat: 7, sat: 7, aath: 8, ath: 8, aat: 8, nau: 9, nao: 9,
};

/** Only ASCII digits, exactly what the database rules count. */
export const asciiDigits = (t) => String(t || '').replace(/[^0-9]/g, '');

/** Turns Indian-script digits and spoken numbers ("nine", "nau", "double 7") into 0-9. */
export function normalizeNumbers(text) {
  let t = String(text || '').toLowerCase();
  t = t.replace(/\p{Nd}/gu, (ch) => {
    const c = ch.codePointAt(0);
    for (const z of INDIC_ZERO) if (c >= z && c <= z + 9) return String(c - z);
    return ch;
  });
  const word = Object.keys(WORDS).join('|');
  t = t.replace(new RegExp(`\\b(double|triple)\\s+(${word}|\\d)\\b`, 'g'), (_, k, w) => {
    const d = /\d/.test(w) ? w : String(WORDS[w]);
    return d.repeat(k === 'double' ? 2 : 3);
  });
  return t.replace(new RegExp(`\\b(${word})\\b`, 'g'), (w) => String(WORDS[w]));
}

/** All digits in a message, counting written-out numbers too. */
export const spokenDigits = (t) => normalizeNumbers(t).replace(/[^0-9]/g, '');

/** A full number in ONE message, even with commas, dots or words between the digits. */
export function looksLikePhone(text) {
  const t = normalizeNumbers(text).replace(/(\d)[\s.,\-_/|:;+()]+(?=\d)/g, '$1');
  return /\d{10}/.test(t);
}

/**
 * Says whether this message would complete a number, from the trail we already have (no network wait).
 * trailData: the sender's trail doc data ({ digits, at }) or null.
 * Returns { blocked, trail, base }: trail is what to save with the message (null = message has no digits).
 */
export function evalTrail(trailData, body) {
  const add = asciiDigits(body);
  const spoken = spokenDigits(body);
  if (!add && !spoken) return { blocked: false, trail: null, base: '' };
  const at = trailData?.at?.toMillis?.() ?? 0;
  const base = trailData && Date.now() - at < TRAIL_WINDOW_MS ? trailData.digits || '' : '';
  const blocked = (base + spoken).length >= TRAIL_LIMIT || (base + add).length >= TRAIL_LIMIT;
  return { blocked, trail: add ? base + add : null, base };
}

/** Same as evalTrail, but reads the trail first (used where no live copy is kept). */
export async function checkTrail(trailPath, body) {
  if (!asciiDigits(body) && !spokenDigits(body)) return { blocked: false, trail: null, base: '' };
  let data = null;
  try { const s = await getDoc(doc(db, ...trailPath)); data = s.exists() ? s.data() : null; } catch { /* the database still checks */ }
  return evalTrail(data, body);
}

export const SPLIT_MSG = 'This looks like a phone number sent in parts. Numbers can’t be shared here yet. Keep talking on BuildMates, it keeps you both safe.';
