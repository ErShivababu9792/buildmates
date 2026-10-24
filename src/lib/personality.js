/**
 * Ten-Item Personality Inventory (TIPI) – Gosling, Rentfrow & Swann (2003).
 * Each item maps to one Big Five trait; reverse-scored items use (8 - answer).
 * Trait order: 0 Extraversion, 1 Agreeableness, 2 Conscientiousness, 3 Emotional stability, 4 Openness.
 */
export const TIPI_ITEMS = [
  { text: 'Extraverted, enthusiastic', trait: 0, reverse: false },
  { text: 'Critical, quarrelsome', trait: 1, reverse: true },
  { text: 'Dependable, self-disciplined', trait: 2, reverse: false },
  { text: 'Anxious, easily upset', trait: 3, reverse: true },
  { text: 'Open to new experiences, complex', trait: 4, reverse: false },
  { text: 'Reserved, quiet', trait: 0, reverse: true },
  { text: 'Sympathetic, warm', trait: 1, reverse: false },
  { text: 'Disorganized, careless', trait: 2, reverse: true },
  { text: 'Calm, emotionally stable', trait: 3, reverse: false },
  { text: 'Conventional, uncreative', trait: 4, reverse: true },
];

export const TRAIT_LABELS = ['Outgoing', 'Warm', 'Organised', 'Calm', 'Curious'];

const TEAM_TYPES = [
  { name: 'The Connector', text: 'You bring people together and keep the team talking.' },
  { name: 'The Supporter', text: 'You keep the team kind, fair and steady.' },
  { name: 'The Planner', text: 'You turn ideas into deadlines and get things done.' },
  { name: 'The Anchor', text: 'You stay calm when things go wrong.' },
  { name: 'The Creative', text: 'You spot new ideas and fresh angles first.' },
];

/** answers: array of 10 numbers 1–7 → five trait scores 1–7 (rounded to 0.5). */
export function scoreTipi(answers) {
  const sums = [0, 0, 0, 0, 0];
  TIPI_ITEMS.forEach((item, i) => {
    const a = answers[i];
    sums[item.trait] += item.reverse ? 8 - a : a;
  });
  return sums.map((s) => Math.round(s) / 2);
}

export function teamType(b5) {
  if (!Array.isArray(b5)) return null;
  let top = 0;
  b5.forEach((v, i) => { if (v > b5[top]) top = i; });
  return TEAM_TYPES[top];
}
