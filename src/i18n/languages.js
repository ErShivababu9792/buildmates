/**
 * The 7 languages BuildMates is written in. All are bundled with the app (src/i18n/*.js),
 * so switching is instant and works offline. Each language's name comes from the browser (Intl.DisplayNames).
 */
export const ALL = ['en', 'hi', 'kn', 'ml', 'ta', 'te', 'mr'];
export const REVIEWED = ALL;
export const RTL = new Set();

/** "தமிழ்" for ta, in its own script (falls back to the code if the browser doesn't know it). */
export function nativeName(code) {
  try {
    const n = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    return n ? n.charAt(0).toLocaleUpperCase(code) + n.slice(1) : code;
  } catch { return code; }
}

/** "Tamil" for ta, in the language the app is shown in right now. */
export function nameIn(code, uiLang) {
  try { return new Intl.DisplayNames([uiLang, 'en'], { type: 'language' }).of(code) || code; } catch { return code; }
}

/** Best match for the browser's language, e.g. "ta-IN" → "ta". */
export function fromBrowser(list = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : []) {
  for (const raw of list) {
    const base = String(raw || '').split('-')[0];
    if (ALL.includes(base)) return base;
  }
  return 'en';
}
