/**
 * Hybrid complementarity matching.
 *
 *   score = 0.35·vision + 0.30·skillFit + 0.20·workingStyle + 0.15·distance
 *
 * Vision:
 *   - Phase 3 (AI): cosine similarity of multilingual sentence embeddings (from the Python AI API),
 *     blended with shared interests. Understands meaning: "tiffin service" ≈ "ghar ka khana delivery".
 *   - Fallback: keyword + interest overlap, used when one of the two profiles has no embedding yet.
 */
import { km, sameArea } from './geo';

export const WEIGHTS = { vision: 0.35, skills: 0.3, style: 0.2, distance: 0.15 };

const STOP = new Set(
  'that with from this into have will which their them they your for and the app apps help helps want build make start simple online need also like more than about ek jo aur hai hain mein liye karna'.split(' '),
);

function keywords(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-zऀ-ॿ\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );
}

export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return null;
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : null;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function scoreMatch(me, other) {
  // 1. Vision
  const sharedInterests = (other.interests || []).filter((i) => (me.interests || []).includes(i));
  const interestShare = sharedInterests.length / Math.max(1, Math.min((me.interests || []).length, (other.interests || []).length));
  const cos = cosine(me.vec, other.vec);
  let vision;
  let visionSource;
  if (cos !== null) {
    // Sentence-embedding cosine for unrelated texts sits around 0.1–0.2; very close ideas reach 0.7+.
    vision = clamp01(0.75 * clamp01((cos - 0.15) / 0.6) + 0.25 * interestShare);
    visionSource = 'ai';
  } else {
    const mine = keywords(`${me.vision} ${(me.interests || []).join(' ')}`);
    const theirs = keywords(`${other.vision} ${(other.interests || []).join(' ')}`);
    let overlap = 0;
    mine.forEach((w) => { if (theirs.has(w)) overlap += 1; });
    vision = Math.min(1, 0.1 + sharedInterests.length * 0.3 + overlap * 0.15);
    visionSource = 'keywords';
  }

  // 2. Skill fit: reward skills I don't have, small bonus for one common skill
  const otherSkills = other.skills || [];
  const newSkills = otherSkills.filter((s) => !(me.skills || []).includes(s));
  const common = otherSkills.length - newSkills.length;
  const skills = Math.min(1, (newSkills.length / Math.max(1, otherSkills.length)) * 0.8 + (common > 0 ? 0.2 : 0.05));

  // 3. Working style: closeness of Big Five scores (1–7 scale)
  let style = 0.6;
  if (Array.isArray(me.b5) && Array.isArray(other.b5)) {
    const diff = me.b5.reduce((sum, v, i) => sum + Math.abs(v - other.b5[i]), 0);
    style = 1 - diff / (5 * 6);
  }

  // 4. Distance: same college, else real distance between the two areas' centres (from OpenStreetMap / India Post)
  const d = km(me.geo, other.geo);
  const sameCollege = Boolean(me.college) && other.college === me.college;
  let distance;
  if (sameCollege) distance = 1;
  else if (d !== null) distance = Math.max(0.2, 1 - d / 25);       // 0 km → 1, 20 km+ → 0.2
  else distance = other.area && other.area === me.area ? 0.6 : 0.3; // older profiles without a map point

  const total = Math.round(
    100 * (WEIGHTS.vision * vision + WEIGHTS.skills * skills + WEIGHTS.style * style + WEIGHTS.distance * distance),
  );

  const reasons = [];
  if (visionSource === 'ai' && cos >= 0.55) reasons.push('Very similar vision');
  if (sharedInterests.length) reasons.push(`Both interested in ${sharedInterests.join(' and ')}`);
  if (newSkills.length) reasons.push(`Brings ${newSkills.join(' and ').toLowerCase()} you don't have`);
  if (sameCollege) reasons.push('Same college');
  else if (d !== null && d <= 3) reasons.push(`About ${Math.max(1, Math.round(d))} km away, in ${other.area}`);
  else if (sameArea(me, other)) reasons.push(`Also near ${other.area}`);
  if (style > 0.8) reasons.push('Similar working style');

  return {
    total,
    km: d,
    parts: { vision, skills, style, distance },
    reasons: reasons.slice(0, 3),
    newSkills,
    visionSource,
  };
}

/** Respect each person's own visibility setting. */
export function canSee(me, other) {
  if (other.visibility === 'college') return other.college === me.college;
  if (other.visibility === 'area') return other.college === me.college || sameArea(me, other);
  return true;
}
