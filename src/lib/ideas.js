/**
 * Idea Board helpers.
 *
 * Three levels of sharing (enforced by Firestore rules, not just hidden in the UI):
 *   pitch   → everyone in your age group         (ideas/{id})
 *   summary → people you're connected with        (ideaDetails/{id})
 *   plan    → only the team members you choose    (ideaPlans/{id})
 */
export const LIMITS = { title: 80, pitch: 160, summary: 1000, plan: 3000, tags: 2, team: 10 };

const BANNED = /\b(bet|betting|gambl\w*|satta|casino|assignment writing|proxy attendance|hack(ing)? (accounts?|instagram|whatsapp)|fake (id|certificates?|degree)|drugs?)\b/;
const HOW_WORDS = /\b(using|via|algorithm|api|qr|razorpay|machine learning|ml model|formula|secret|patent)\b/;

/** Same checks as the AI API's /idea-check, so they work even when the server is asleep. */
export function localIdeaCheck({ title, pitch, summary, plan }) {
  const out = [];
  const all = `${title} ${pitch} ${summary} ${plan}`.toLowerCase();
  if (BANNED.test(all)) out.push({ level: 'bad', msg: 'This idea may break our rules (betting, cheating, hacking or fake documents). It will go to admin review before anyone sees it.' });
  if (HOW_WORDS.test(String(pitch).toLowerCase())) out.push({ level: 'warn', msg: 'Your public line may reveal how your solution works. Say what problem it solves, not how.' });
  return out;
}

/** SHA-256 fingerprint of the idea at the moment it was posted: proof of what you wrote and when. */
export async function proofHash({ title, pitch, summary, plan }, uid) {
  const text = JSON.stringify([uid, title, pitch, summary, plan]);
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function formatWhen(ts) {
  const d = ts?.toDate?.();
  return d ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}
