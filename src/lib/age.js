/** Age in full years on a given date. `dob` is "YYYY-MM-DD". */
export function ageOn(dob, today = new Date()) {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number);
  if (!y || !m || !d) return null;
  let age = today.getFullYear() - y;
  const beforeBirthday = today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/** Date of birth string → Date at 00:00 UTC (what we store in Firestore). */
export function dobToDate(dob) {
  const [y, m, d] = dob.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Firestore Timestamp/Date → "YYYY-MM-DD". */
export function dateToDob(value) {
  if (!value) return '';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return date.toISOString().slice(0, 10);
}
