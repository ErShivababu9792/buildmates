/**
 * AI Team Builder: recommends the people who best complete a TEAM (not a person).
 *
 *   fit = 0.40·skillGap + 0.25·vision + 0.20·styleBalance + 0.15·distance
 *
 * - skillGap:     share of the team's missing skills the candidate brings
 *                 (missing = skills of open roles, or else common skills nobody in the team has)
 * - vision:       cosine similarity of the candidate's AI vector with the team's average vector
 *                 (meaning-based, works in English / Hindi / Hinglish); keyword overlap as fallback
 * - styleBalance: Big Five (TIPI). Rewards a candidate who is strong where the team is weak,
 *                 plus similar agreeableness (teams with very different warmth fight more)
 * - distance:     same college > same area > same city
 *
 * Every suggestion carries plain-language reasons, so the result is explainable in a viva.
 */
import { cosine } from './matching';
import { km } from './geo';

export const BUILDER_WEIGHTS = { skills: 0.4, vision: 0.25, style: 0.2, distance: 0.15 };
const TRAITS = ['outgoing', 'warm', 'organised', 'calm', 'curious'];
const CORE_SKILLS = ['Coding', 'Design', 'Marketing', 'Sales', 'Writing', 'Data analysis', 'Public speaking', 'Finance'];

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const words = (t) => new Set(String(t || '').toLowerCase().replace(/[^a-zऀ-ॿ\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3));

function mean(vectors) {
  const list = vectors.filter((v) => Array.isArray(v) && v.length);
  if (!list.length) return null;
  const out = new Array(list[0].length).fill(0);
  list.forEach((v) => v.forEach((x, i) => { out[i] += x / list.length; }));
  return out;
}

/** What the team already has, and what it still needs. */
export function teamProfile(members, openRoleSkills = []) {
  const skills = new Set(members.flatMap((m) => m.skills || []));
  const missing = openRoleSkills.length
    ? [...new Set(openRoleSkills)]
    : CORE_SKILLS.filter((s) => !skills.has(s));
  const b5s = members.map((m) => m.b5).filter((b) => Array.isArray(b) && b.length === 5);
  const b5 = b5s.length ? [0, 1, 2, 3, 4].map((i) => b5s.reduce((s, b) => s + b[i], 0) / b5s.length) : null;
  const interests = new Set(members.flatMap((m) => m.interests || []));
  const text = members.map((m) => [m.vision, ...(m.interests || [])].join(' ')).join(' ');
  return {
    skills, missing, b5, interests, words: words(text),
    vec: mean(members.map((m) => m.vec)),
    colleges: new Set(members.map((m) => m.college).filter(Boolean)),
    areas: new Set(members.map((m) => m.area).filter(Boolean)),
    geos: members.map((m) => m.geo).filter(Boolean),
    size: members.length,
  };
}

export function scoreCandidate(team, c) {
  const reasons = [];

  // 1) skill gap
  const brings = (c.skills || []).filter((s) => team.missing.includes(s));
  const skills = team.missing.length ? clamp01(brings.length / Math.min(2, team.missing.length)) : 0.3;
  if (brings.length) reasons.push(`Brings ${brings.join(' and ').toLowerCase()}, which your team is missing`);

  // 2) vision
  let vision = null;
  let visionSource = 'keywords';
  const cos = cosine(team.vec, c.vec);
  if (cos !== null) {
    vision = clamp01((cos - 0.15) / 0.6); // multilingual MiniLM: ~0.15 unrelated, ~0.75 very close
    visionSource = 'ai';
  } else {
    const w = words([c.vision, ...(c.interests || [])].join(' '));
    const overlap = [...w].filter((x) => team.words.has(x)).length;
    const shared = (c.interests || []).filter((i) => team.interests.has(i)).length;
    vision = clamp01(overlap * 0.15 + shared * 0.3);
  }
  const sharedInterests = (c.interests || []).filter((i) => team.interests.has(i));
  if (vision >= 0.55) reasons.push(visionSource === 'ai' ? 'Their vision is close to what your team is building' : `Shares your team’s interest in ${sharedInterests[0] || 'the same area'}`);

  // 3) working-style balance
  let style = 0.5;
  if (team.b5 && Array.isArray(c.b5)) {
    const gaps = team.b5.map((t, i) => (t < 4.5 ? clamp01((c.b5[i] - t) / 3) : 0));
    const fills = gaps.filter((g) => g > 0);
    const balance = fills.length ? fills.reduce((s, g) => s + g, 0) / fills.length : 0.5;
    const warmth = 1 - Math.abs(team.b5[1] - c.b5[1]) / 6;
    style = clamp01(0.7 * balance + 0.3 * warmth);
    const best = gaps.indexOf(Math.max(...gaps));
    if (gaps[best] >= 0.34) reasons.push(`More ${TRAITS[best]} than the team on average, a good balance`);
  }

  // 4) distance
  let distance = 0.4;
  const near = team.geos.map((g) => km(g, c.geo)).filter((x) => x !== null);
  const closest = near.length ? Math.min(...near) : null;
  if (team.colleges.has(c.college)) { distance = 1; reasons.push('Studies at the same college'); }
  else if (closest !== null) {
    distance = Math.max(0.2, 1 - closest / 25);
    if (closest <= 5) reasons.push(`About ${Math.max(1, Math.round(closest))} km from your team`);
  } else if (team.areas.has(c.area)) { distance = 0.8; reasons.push(`Lives in ${c.area}, near your team`); }

  const total = Math.round(100 * (BUILDER_WEIGHTS.skills * skills + BUILDER_WEIGHTS.vision * vision
    + BUILDER_WEIGHTS.style * style + BUILDER_WEIGHTS.distance * distance));
  return { total, parts: { skills, vision, style, distance }, reasons, brings, visionSource };
}

/** Top `n` candidates for the team. `exclude` = ids already in the team, blocked, or already invited. */
export function suggestForTeam(members, candidates, { openRoleSkills = [], exclude = new Set(), n = 5 } = {}) {
  const team = teamProfile(members, openRoleSkills);
  const list = candidates
    .filter((c) => !exclude.has(c.id) && (c.status || 'active') === 'active' && Array.isArray(c.skills))
    .map((c) => ({ c, s: scoreCandidate(team, c) }))
    .filter(({ s }) => s.brings.length > 0 || !team.missing.length) // must add something the team lacks
    .sort((a, b) => b.s.total - a.s.total);
  return { team, list: list.slice(0, n) };
}
