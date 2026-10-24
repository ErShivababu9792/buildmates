/**
 * Idea Dost: a guided coach that helps beginners shape a rough thought into a clear idea.
 * It asks the questions an experienced founder would ask and gives honest, rule-based feedback.
 * (No paid AI model needed; works offline.)
 */
export const COACH_STEPS = [
  {
    id: 'problem',
    q: 'What problem do you want to solve? Describe what goes wrong today.',
    placeholder: 'e.g. Hostel students eat outside food every day because the mess food is bad',
  },
  {
    id: 'who',
    q: 'Who has this problem the most? Be specific.',
    placeholder: 'e.g. First-year students in hostels near Hebbal',
  },
  {
    id: 'today',
    q: 'What do they do about it today?',
    placeholder: 'e.g. Order from Swiggy, which is costly; some skip meals',
  },
  {
    id: 'solution',
    q: 'What is your solution, in one or two lines?',
    placeholder: 'e.g. Weekly homemade meal plans from local home cooks, delivered to the hostel gate',
  },
  {
    id: 'first',
    q: 'What is the smallest first step you could do this week?',
    placeholder: 'e.g. Ask 20 hostel students if they would pay ₹80 per meal',
  },
];

const VAGUE = /\b(everyone|everybody|all people|sab log|sabhi|anyone|world|logon ko)\b/i;
const NUMBER = /\d/;
const BIG = /\b(app|platform|website|ai|blockchain|marketplace)\b/i;

/** Gentle, specific feedback for each answer. */
export function feedbackFor(stepId, text) {
  const t = String(text || '').trim();
  if (t.length < 12) return { tone: 'warn', text: 'Add a little more detail. One clear sentence is enough.' };
  switch (stepId) {
    case 'problem':
      if (BIG.test(t) && !/\b(problem|difficult|hard|costly|waste|late|bad|can’t|cannot|nahi|mushkil)\b/i.test(t)) return { tone: 'warn', text: 'This sounds like a solution. Try describing the pain first: what goes wrong for people today?' };
      return { tone: 'good', text: 'Good, a clear problem is the strongest start.' };
    case 'who':
      if (VAGUE.test(t)) return { tone: 'warn', text: '“Everyone” is too wide. Pick one group you can actually meet this week.' };
      return { tone: 'good', text: 'Specific users make it easy to test your idea.' };
    case 'today':
      return { tone: 'good', text: 'Knowing what people do today tells you who you are competing with.' };
    case 'solution':
      if (t.length > 220) return { tone: 'warn', text: 'Try to say it in two lines. If it needs a long explanation, it may be too big to start with.' };
      return { tone: 'good', text: 'Nice and simple. Simple ideas are easier to build and explain.' };
    case 'first':
      if (!NUMBER.test(t)) return { tone: 'warn', text: 'Add a number (how many people, how many days). It makes the step real.' };
      return { tone: 'good', text: 'A small step you can measure. That’s exactly how good founders start.' };
    default:
      return null;
  }
}

/** Turn the answers into a pitch and summary the student can post on the Idea Board. */
export function buildIdea(a) {
  const short = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
  const pitch = short(`Helping ${a.who.replace(/\.$/, '')} with ${a.problem.charAt(0).toLowerCase()}${a.problem.slice(1).replace(/\.$/, '')}`, 160);
  const summary = [
    `Problem: ${a.problem}`,
    `Who: ${a.who}`,
    `Today they: ${a.today}`,
    `Our idea: ${a.solution}`,
    `First step: ${a.first}`,
  ].join('\n');
  return { pitch, summary };
}

export const COACH_CHECKLIST = [
  'Talk to at least 10 people who have the problem',
  'Ask what they do today and what it costs them',
  'Find 3 apps or services that already try to solve it',
  'Write what makes your idea different in one line',
  'Find a teammate with the skill you don’t have',
];
