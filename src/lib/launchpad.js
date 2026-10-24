/** Launchpad: for students who have BUILT something and don't know how to grow it. */
export const STAGES = [
  { id: 'prototype', label: 'Prototype', text: 'It works, but only a few people tried it' },
  { id: 'live', label: 'Live', text: 'Anyone can use it today' },
  { id: 'users', label: 'Has users', text: 'People use it regularly' },
];

export const NEEDS = [
  { id: 'growth', label: 'Growth partner', text: 'Someone to do marketing, sales or social media', skills: ['Marketing', 'Sales', 'Video editing', 'Public speaking', 'Writing', 'Photography'] },
  { id: 'guidance', label: 'Guidance', text: 'Advice on what to do next', skills: [] },
  { id: 'testers', label: 'Testers', text: 'People to try it and give honest feedback', skills: [] },
  { id: 'takeover', label: 'Someone to take over', text: 'I don’t have time; someone could run it', skills: ['Coding', 'Design'] },
];

export const needLabel = (id) => NEEDS.find((n) => n.id === id)?.label || id;

/** A first-100-users plan tailored to a student product. Honest, simple steps that work on a campus. */
export function growthPlan(p) {
  const steps = [];
  steps.push({ title: 'Write one clear sentence', text: `Explain ${p.name} as “It helps [who] do [what] without [pain]”. Put it at the top of your page.` });
  if (p.stage === 'prototype') {
    steps.push({ title: 'Get 10 real testers', text: 'Sit with 10 students while they use it. Don’t explain anything; note where they get stuck. Fix the top 3 problems.' });
  }
  steps.push({ title: 'Start where you are', text: 'Share it in your class and hostel WhatsApp groups with a short screen recording, not just a link.' });
  steps.push({ title: 'Go offline on campus', text: 'Put up a poster with a QR code at the canteen, library and notice board. Stand there for one lunch break and help people sign up.' });
  if ((p.tag || '') === 'Food' || (p.tag || '') === 'Health') steps.push({ title: 'Partner locally', text: 'Ask one nearby shop, mess or gym to recommend you. Offer them something useful in return.' });
  if ((p.tag || '') === 'EdTech') steps.push({ title: 'Work with seniors and clubs', text: 'Ask a senior or a college club to try it with their members. One club can bring 30–50 users.' });
  steps.push({ title: 'Make one short video a week', text: 'A 30-second reel showing a real use. Post it on Instagram and YouTube Shorts.' });
  steps.push({ title: 'Measure every week', text: 'Track 3 numbers: new users, users who came back, and feedback received. Improve one thing every week.' });
  if (p.needs?.includes('growth')) steps.push({ title: 'Find your growth partner', text: 'Use the “Students who can help” list below. Offer a clear role and agree on credit and money in a team agreement.' });
  return steps;
}

/**
 * Very rough starting range for a conversation about a student product. It is NOT a valuation.
 * Shown to protect students from accepting a far-too-low offer.
 */
export function valuationGuide(p) {
  const users = Math.max(0, Number(p.users) || 0);
  const base = { prototype: [5000, 25000], live: [15000, 75000], users: [40000, 200000] }[p.stage] || [0, 0];
  const perUser = [30, 150];
  return [base[0] + users * perUser[0], base[1] + users * perUser[1]].map((v) => Math.round(v / 1000) * 1000);
}

export const formatINR = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

export const OFFER_KINDS = [
  { id: 'mentor', label: 'Mentor', text: 'Guide the team for free or for a fee' },
  { id: 'cobuild', label: 'Co-build', text: 'Bring experience, network or resources as a partner' },
  { id: 'buy', label: 'Offer to buy', text: 'A non-binding offer; nothing is final until both sign an agreement' },
];

export const COOLING_OFF_DAYS = 3;
