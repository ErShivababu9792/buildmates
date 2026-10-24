export const MAX_TEAM = 6;

/** Small first tasks a new team does together before deciding to stay together. */
export const TRIAL_CHALLENGES = [
  'Make a one-page poster for the idea',
  'Talk to 10 students about the problem and note what they say',
  'Sketch the first 3 screens of the app on paper or Figma',
  'Write a 1-minute pitch and record it',
  'List 5 competitors and what they do badly',
];

export const TASK_STATUS = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'Doing' },
  { id: 'done', label: 'Done' },
];

export const EXIT_REASONS = [
  'Not enough time right now',
  'Idea is not for me',
  'Working styles didn’t match',
  'Joining another team',
  'Other',
];

export const AGREEMENT_FIELDS = [
  { id: 'roles', label: 'Who does what', hint: 'e.g. Ananya: app, Rahul: marketing, Shiva: design' },
  { id: 'time', label: 'Time each person gives', hint: 'e.g. 5 hours a week, weekends' },
  { id: 'decisions', label: 'How we decide', hint: 'e.g. majority vote, owner decides on ties' },
  { id: 'credit', label: 'Credit', hint: 'e.g. everyone’s name on the project, in the order of work done' },
  { id: 'money', label: 'If it makes money', hint: 'e.g. split equally after costs, decide again before investors' },
];

/** Public places only. Safe Meet never suggests homes, rooms or hostels. */
export const PUBLIC_PLACES = [
  'College library',
  'College canteen',
  'E-cell / incubation centre',
  'A public café',
  'Co-working space',
];

export const MEET_TIPS = [
  'Meet in daytime in a busy public place.',
  'Tell a friend or family member where you’re going.',
  'Keep talking inside BuildMates until you trust each other.',
  'Leave any time you feel uncomfortable, and report it.',
];

/* ---------------- Phase 12 ---------------- */

/** Time a role needs. */
export const ROLE_HOURS = ['1–3 hours a week', '3–6 hours a week', '6–10 hours a week', 'Weekends only'];

/** ISO week like "2026-W43", used to group weekly check-ins. */
export function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** The last `n` week keys, newest first. */
export function lastWeeks(n = 4, from = new Date()) {
  return Array.from({ length: n }, (_, i) => weekKey(new Date(from.getTime() - i * 7 * 86400000)));
}

export const MOODS = [
  { id: 'good', label: 'Going well', emoji: '🟢' },
  { id: 'ok', label: 'Okay', emoji: '🟡' },
  { id: 'stuck', label: 'Stuck', emoji: '🔴' },
];

/** Simple, explainable tips from this week's check-ins and the task board. */
export function checkinTips({ members, checkins, tasks }) {
  const tips = [];
  const done = new Set(checkins.map((c) => c.uid));
  const missing = members.filter((m) => !done.has(m));
  const stuck = checkins.filter((c) => c.mood === 'stuck');
  const blockers = checkins.filter((c) => c.blocker?.trim());
  const doing = tasks.filter((t) => t.status === 'doing').length;
  const todo = tasks.filter((t) => t.status === 'todo').length;
  const unassigned = tasks.filter((t) => t.status !== 'done' && !t.assignee).length;
  const hours = checkins.reduce((s, c) => s + (Number(c.hours) || 0), 0);

  if (stuck.length) tips.push(`${stuck.length} ${stuck.length > 1 ? 'people are' : 'person is'} stuck. Spend 15 minutes on a quick team call to unblock them first.`);
  if (blockers.length) tips.push('There are blockers this week. Turn each blocker into a task on the board and give it an owner.');
  if (missing.length && members.length > 1) tips.push(`${missing.length} of ${members.length} haven’t checked in yet. A short nudge in the team chat helps.`);
  if (!doing && todo) tips.push('Nobody is working on a task right now. Each person can pick one “To do” task and move it to “Doing”.');
  if (unassigned >= 3) tips.push(`${unassigned} open tasks have no owner. Tasks without an owner usually don’t get done.`);
  if (checkins.length && hours === 0) tips.push('No hours logged this week. Even 2 hours each keeps the project alive.');
  if (!tips.length && checkins.length) tips.push('Nice rhythm! Keep tasks small (one evening each) so progress stays visible.');
  return tips;
}

/** One line a student can paste into a resume. */
export function resumeLine(sc, role) {
  const stack = (sc.stack || []).slice(0, 4).join(', ');
  return `${role ? `${role}, ` : ''}${sc.title}: ${sc.tagline}${stack ? ` Built with ${stack}.` : ''} Team of ${(sc.memberIds || []).length} via BuildMates${sc.link ? ` · ${sc.link}` : ''}`;
}

/* ---------------- Learning circles ---------------- */
export const CIRCLE_LEVELS = ['Complete beginner', 'Know the basics', 'Some experience'];
export const CIRCLE_MODES = ['Online', 'At college', 'In person'];
export const CIRCLE_IDEAS = [
  'Learn React in 6 weeks',
  'Python for data analysis',
  'UI design with Figma',
  'Public speaking practice',
  'Build a portfolio website',
  'Crack DSA basics together',
];
