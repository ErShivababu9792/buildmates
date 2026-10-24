import { useSyncExternalStore } from 'react';

/**
 * Light / dark mode. 'system' follows the phone or laptop setting.
 * Saved on this device (localStorage) and applied as <html data-theme="light|dark">.
 * index.html applies it before the app loads, so there is no white flash.
 */
const KEY = 'bm_theme';
const EVENT = 'bm-theme';
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getTheme() {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; }
}

/** The colours actually on screen right now. */
export const resolvedTheme = (t = getTheme()) => (t === 'system' ? (media?.matches ? 'dark' : 'light') : t);

export function applyTheme(t = getTheme()) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolvedTheme(t) === 'dark' ? '#0E1513' : '#0E6B57');
}

export function setTheme(t) {
  try { if (t === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* storage blocked */ }
  applyTheme(t);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb) {
  const onMedia = () => { applyTheme(); cb(); };
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  media?.addEventListener?.('change', onMedia);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb); media?.removeEventListener?.('change', onMedia); };
}

/** { theme: 'system'|'light'|'dark', resolved: 'light'|'dark' } */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'system');
  return { theme, resolved: resolvedTheme(theme) };
}
