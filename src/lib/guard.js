/**
 * AI Chat Guard – Phase 2 (rule-based, runs in the browser before a message is sent).
 * Understands common Hinglish + English patterns used by Indian students.
 * Phase 3 replaces this with a trained classifier on the Python AI API, keeping the same output shape.
 *
 * level: 'ok'    → send normally
 *        'warn'  → send, but show the sender a gentle warning
 *        'block' → do not send
 */
import { looksLikePhone } from './digits';

const RULES = [
  {
    level: 'block',
    kind: 'Contact sharing',
    msg: 'Phone numbers and social IDs can’t be shared in the first 7 days. Keep talking here, it keeps you both safe.',
    test: (t) =>
      looksLikePhone(t)   // also "nine eight seven…", "nau aath…", Indian-script digits, commas between digits
      || /\b(num|numb|nmbr|number|no\.?|mobile|contact)\s*(de|do|dena|bhej|bhejo|send|share|kya hai|batao)\b/.test(t)
      || /\b(whatsapp|whats app|wa|insta|instagram|snap|snapchat|telegram)\b\s*(id|pe|par|on|de|do|kar|karo|chat)?/.test(t),
  },
  {
    level: 'block',
    kind: 'Money request',
    msg: 'Asking for money isn’t allowed on BuildMates. If someone asks you to pay to join a project, report them.',
    test: (t) =>
      /₹\s?\d|\brs\.?\s?\d|\b\d+\s?(rs|rupees|rupaye)\b/.test(t)
      || /\b(upi|gpay|google pay|phonepe|paytm)\b/.test(t)
      || /\b(paise|paisa|money|fees?)\s*(bhej|bhejo|do|de|dena|send|pay|lagegi|lagega)\b/.test(t)
      || /\b(invest|investment|double your|pay me|send money|registration fee)\b/.test(t),
  },
  {
    level: 'block',
    kind: 'Abusive language',
    msg: 'Abusive words aren’t allowed. Please keep it respectful.',
    test: (t) => /\b(idiot|stupid|dumb|moron|fuck|fucking|fuck off|shit|bitch|bastard|asshole|chutiya|chutiye|chutiyapa|bewakoof|bewkoof|kamina|kamine|kameena|kaminey|kutta|kutte|kutiya|saala|saale|sala|harami|haramkhor|bc|mc|bsdk|bhosdike|bhosdi|madarchod|bhenchod|behenchod|lavde|lode|gaandu|gandu|randi|suar|ghatiya|nalayak|gadha|gadhe|ullu|bakwas kar|chup kar|nikal yahan se|get lost|loser)\b/.test(t),
  },
  {
    level: 'warn',
    kind: 'Personal, not about the project',
    msg: 'This sounds personal rather than about the project. BuildMates is for building together.',
    test: (t) => /\b(beautiful|cute|hot|sexy|jaan|baby|babu|darling|single ho|girlfriend|boyfriend|gf|bf|pyaar|love you|date pe|date par|date on)\b/.test(t),
  },
  {
    level: 'warn',
    kind: 'Link',
    msg: 'Links can be unsafe. Only open links from people you trust.',
    test: (t) => /(https?:\/\/|www\.|bit\.ly|tinyurl)/.test(t),
  },
];

export function checkMessage(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  for (const rule of RULES) {
    if (rule.test(t)) return { level: rule.level, kind: rule.kind, msg: rule.msg };
  }
  return { level: 'ok' };
}

export const ICE_BREAKERS = [
  'What made you start this idea?',
  'What do you need help with first?',
  'Want to try a small weekend task together?',
];

export const REPORT_REASONS = [
  'Asked for money',
  'Harassment or flirting',
  'Pressure to share number',
  'Fake profile',
  'Abusive language',
  'Something else',
];
