// OpenWA service worker.
//
// IMPORTANT lesson: a service worker that caches the HTML navigation
// response also replays that response's HEADERS (including
// Content-Security-Policy). If the shell is cached while a strict/old CSP
// is active, the browser keeps enforcing that stale CSP even after the
// server starts sending a corrected one. To avoid this class of bug:
//
//   - Navigations (HTML) are NEVER handled by the SW — they pass straight
//     through to the network, so CSP and other headers are always fresh.
//   - Only content-addressed, hashed /assets/ are cached (safe: a new
//     build produces new filenames).
//   - /api and /socket.io are never touched.
//
// The manifest + icons still make the app installable ("Add to Home
// Screen") without the SW caching the shell.

const VERSION = 'v3';
const ASSET_CACHE = `openwa-assets-${VERSION}`;

self.addEventListener('install', () => {
  // Activate immediately; nothing to pre-cache.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== ASSET_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Never handle navigations/HTML — let the network serve fresh headers.
  if (req.mode === 'navigate') return;
  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/html')) return;

  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

  // Cache-first only for immutable, hashed build assets.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Everything else: plain network passthrough (no caching of headers).
});
