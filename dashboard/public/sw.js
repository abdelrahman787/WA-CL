// OpenWA service worker — minimal app-shell cache.
//
// Strategy:
//   - Pre-cache the shell on install.
//   - Network-first for /api/* — falls back to cache only if the cached
//     response is still fresh enough for offline browsing.
//   - Cache-first for static assets (JS/CSS/img) so repeat loads are
//     instant even on poor links.

const VERSION = 'v1';
const SHELL_CACHE = `openwa-shell-${VERSION}`;
const RUNTIME_CACHE = `openwa-runtime-${VERSION}`;

const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/openwa_logo.webp',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Don't cache /api or WebSocket upgrades.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    return;
  }

  // Cache-first for hashed Vite assets.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Network-first for everything else, fall back to cache when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (url.origin === self.location.origin)) {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
  );
});
