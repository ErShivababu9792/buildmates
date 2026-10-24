/**
 * Only http(s) links from user content are ever turned into clickable links.
 * Stops "javascript:" and "data:" links (a common way to run code in someone else's browser).
 */
export function safeUrl(u) {
  try {
    const url = new URL(String(u || '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}
