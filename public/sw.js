/* BuildMates service worker: makes the app open fast and work on weak or no internet.
 * - Pages (navigations): network first, saved copy when offline.
 * - Built files (/assets/*, icons, fonts): cache first (their names change on every build).
 * - Firebase, the AI API and Cloudinary uploads are never cached here
 *   (Firestore has its own offline cache inside the app).
 */
const VERSION = 'bm-v13-1';
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/logo.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).catch(() => null));
  // Wait for the page to say "update now" before taking over (see SKIP_WAITING below)
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

const isStatic = (url) => url.origin === self.location.origin
  && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || /\.(svg|png|webmanifest)$/.test(url.pathname));
const isFont = (url) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL);
        cache.put('/index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  if (isStatic(url) || isFont(url)) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') (await caches.open(STATIC)).put(req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })());
  }
  // Everything else (Firebase, AI API, Cloudinary, maps): straight to the network
});

// ---------- Phone notifications (Phase 11) ----------
// The server sends data-only messages through Firebase Cloud Messaging: { title, body, url, tag }.
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const d = payload.data || payload.notification || payload;
  const title = d.title || 'BuildMates';
  event.waitUntil((async () => {
    // If the app is open and on screen, the in-app bell already shows it
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (open.some((c) => c.visibilityState === 'visible' && c.focused)) return;
    await self.registration.showNotification(title, {
      body: d.body || '',
      tag: d.tag || undefined,
      renotify: Boolean(d.tag),
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: d.url && d.url.startsWith('/') ? d.url : '/notifications' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/notifications';
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = open.find((c) => new URL(c.url).origin === self.location.origin);
    if (same) { await same.focus(); return same.navigate(url).catch(() => null); }
    return self.clients.openWindow(url);
  })());
});
