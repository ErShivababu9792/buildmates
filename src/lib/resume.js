/**
 * Resume builder helpers. The resume is filled from what the student really did on BuildMates
 * (published projects, teams, finished learning circles), so every line is backed by proof.
 */
export const EMPTY_RESUME = {
  template: 'classic',
  headline: '',
  summary: '',
  email: '',
  phone: '',
  location: '',
  links: { linkedin: '', github: '', portfolio: '' },
  education: [{ degree: '', school: '', years: '', score: '' }],
  experience: [],
  extraProjects: [],
  hiddenProjects: [],
  extraSkills: '',
  achievements: '',
  languages: '',
  show: { teams: true, circles: true, verified: true },
};

/** Fill missing keys (older saved resumes, partial data). */
export function withDefaults(r) {
  const x = { ...EMPTY_RESUME, ...(r || {}) };
  x.links = { ...EMPTY_RESUME.links, ...(r?.links || {}) };
  x.show = { ...EMPTY_RESUME.show, ...(r?.show || {}) };
  ['education', 'experience', 'extraProjects', 'hiddenProjects'].forEach((k) => { if (!Array.isArray(x[k])) x[k] = []; });
  return x;
}

/** A starting headline and summary written from the profile. The student edits it. */
export function suggestIntro(profile, projects, teams) {
  const skills = (profile.skills || []).slice(0, 3);
  const role = profile.role === 'Builder' ? 'builder' : profile.role === 'Idea person' ? 'idea-driven student' : 'student builder';
  const headline = skills.length ? `${skills.join(' · ')} | ${profile.college || 'Student'}` : (profile.college || 'Student');
  const parts = [];
  parts.push(`${role[0].toUpperCase()}${role.slice(1)} at ${profile.college || 'college'}${skills.length ? ` with skills in ${skills.join(', ').toLowerCase()}` : ''}.`);
  if (projects.length) parts.push(`Built ${projects.length === 1 ? 'a project' : `${projects.length} projects`} with student teams, including ${projects[0].title}.`);
  else if (teams.length) parts.push(`Working in ${teams.length === 1 ? 'a student team' : `${teams.length} student teams`} on real problems.`);
  if (profile.interests?.length) parts.push(`Interested in ${profile.interests.slice(0, 3).join(', ')}.`);
  if (profile.teamType) parts.push(`Working style: ${profile.teamType.replace(/^The /, '')}.`);
  return { headline: headline.slice(0, 100), summary: parts.join(' ').slice(0, 500) };
}

/** Turn a published showcase into resume bullets (short, action-first). */
export function projectBullets(sc, uid) {
  const out = [];
  const role = sc.members?.[uid]?.role;
  const size = (sc.memberIds || []).length;
  out.push(`${role ? `${role} in` : 'Member of'} a team of ${size}${sc.tagline ? `: ${sc.tagline.replace(/\.$/, '')}` : ''}.`);
  const firstSentence = String(sc.built || '').split(/(?<=[.!?])\s+/)[0];
  if (firstSentence && firstSentence.length > 15) out.push(firstSentence.slice(0, 180));
  if (sc.stack?.length) out.push(`Tech: ${sc.stack.join(', ')}.`);
  return out;
}

export const splitList = (s) => String(s || '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
export const splitLines = (s) => String(s || '').split('\n').map((x) => x.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);

/** Plain text version (paste into job portals / ATS forms). */
export function resumeText(r, data) {
  const L = [];
  L.push(data.name.toUpperCase());
  if (r.headline) L.push(r.headline);
  L.push([r.email, r.phone, r.location, r.links.linkedin, r.links.github, r.links.portfolio].filter(Boolean).join(' | '));
  if (r.summary) L.push('', 'SUMMARY', r.summary);
  if (data.skills.length) L.push('', 'SKILLS', data.skills.join(', '));
  if (data.projects.length) {
    L.push('', 'PROJECTS');
    data.projects.forEach((p) => { L.push(`${p.title}${p.link ? ` (${p.link})` : ''}`); p.bullets.forEach((b) => L.push(`- ${b}`)); });
  }
  if (r.experience.length) {
    L.push('', 'EXPERIENCE');
    r.experience.forEach((e) => { L.push(`${e.title}, ${e.org} (${e.period})`); splitLines(e.points).forEach((b) => L.push(`- ${b}`)); });
  }
  if (data.activities.length) { L.push('', 'ACTIVITIES'); data.activities.forEach((a) => L.push(`- ${a}`)); }
  const edu = r.education.filter((e) => e.degree || e.school);
  if (edu.length) { L.push('', 'EDUCATION'); edu.forEach((e) => L.push(`${e.degree}, ${e.school} (${e.years})${e.score ? ` – ${e.score}` : ''}`)); }
  const ach = splitLines(r.achievements);
  if (ach.length) { L.push('', 'ACHIEVEMENTS'); ach.forEach((a) => L.push(`- ${a}`)); }
  if (r.languages) L.push('', 'LANGUAGES', r.languages);
  return L.join('\n');
}
