export const EVENT_KINDS = ['Hackathon', 'Workshop', 'Competition', 'Meetup', 'Fest'];
export const EVENT_MODES = ['In person', 'Online'];

const ms = (ts) => ts?.toMillis?.() || 0;

/** Upcoming first (soonest at the top), then past events (latest first). */
export function sortEvents(list, now = Date.now()) {
  const upcoming = list.filter((e) => ms(e.endAt) >= now).sort((a, b) => ms(a.startAt) - ms(b.startAt));
  const past = list.filter((e) => ms(e.endAt) < now).sort((a, b) => ms(b.startAt) - ms(a.startAt));
  return { upcoming, past };
}

export function eventWhen(e) {
  const s = e.startAt?.toDate?.();
  const end = e.endAt?.toDate?.();
  if (!s) return '';
  const day = { weekday: 'short', day: 'numeric', month: 'short' };
  const hm = { hour: 'numeric', minute: '2-digit' };
  if (!end || s.toDateString() === end.toDateString()) {
    return `${s.toLocaleDateString('en-IN', day)} · ${s.toLocaleTimeString('en-IN', hm)}${end ? `–${end.toLocaleTimeString('en-IN', hm)}` : ''}`;
  }
  return `${s.toLocaleDateString('en-IN', day)} → ${end.toLocaleDateString('en-IN', day)}`;
}

/** Days left until the event starts: 'Today', 'Tomorrow', 'In 5 days', 'Happening now', 'Ended'. */
export function countdown(e, now = Date.now()) {
  const start = ms(e.startAt);
  const end = ms(e.endAt);
  if (end < now) return 'Ended';
  if (start <= now) return 'Happening now';
  const days = Math.floor((new Date(start).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400e3);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}
