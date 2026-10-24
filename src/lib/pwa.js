import { useSyncExternalStore } from 'react';

/**
 * Small store for app-install and update state, shared by any component.
 * - installEvent: the browser's "beforeinstallprompt" (Android / desktop Chrome, Edge)
 * - waiting:      a new service worker is ready → show "Update now"
 * - online:       navigator.onLine
 */
let state = { installEvent: null, installed: false, waiting: null, online: typeof navigator === 'undefined' ? true : navigator.onLine };
const subs = new Set();
const set = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

export const usePwa = () => useSyncExternalStore(subscribe, () => state, () => state);

export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export async function promptInstall() {
  const e = state.installEvent;
  if (!e) return false;
  e.prompt();
  const { outcome } = await e.userChoice;
  set({ installEvent: null, installed: outcome === 'accepted' });
  return outcome === 'accepted';
}

export function applyUpdate() {
  const w = state.waiting;
  if (!w) return;
  w.postMessage('SKIP_WAITING');
}

/** Called once from main.jsx. The service worker only runs in the production build (npm run build / live site). */
export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); set({ installEvent: e }); });
  window.addEventListener('appinstalled', () => set({ installEvent: null, installed: true }));
  window.addEventListener('online', () => set({ online: true }));
  window.addEventListener('offline', () => set({ online: false }));

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const watch = (sw) => sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) set({ waiting: sw });
      });
      if (reg.waiting && navigator.serviceWorker.controller) set({ waiting: reg.waiting });
      reg.addEventListener('updatefound', () => watch(reg.installing));
      // Look for a new version every 30 minutes while the app is open
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    } catch (e) {
      console.warn('Offline mode not available:', e.message);
    }
  });
}
