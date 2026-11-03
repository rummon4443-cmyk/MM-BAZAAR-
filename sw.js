/* ==========================================================
   MM BAZAAR — Service Worker (V7)
   • Pre-caches the app shell so the store opens instantly
     and still paints when the network is flaky.
   • Stale-while-revalidate for same-origin assets & fonts.
   • NEVER caches Firebase / Firestore API traffic, so live
     product & order data stays real-time.
   ========================================================== */
const VERSION = 'mmb-cache-v7.0.0';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'PING') event.source && event.source.postMessage({ type: 'PONG', version: VERSION });
});

/* Hosts whose responses must always be live */
function isLiveApi(url) {
  return /firestore|firebaseio|identitytoolkit|securetoken|firebaseinstallations|google-analytics|googletagmanager/i
    .test(url.hostname + url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (isLiveApi(url)) return; // straight to network, no caching

  /* App navigation: network-first with offline shell fallback */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./')))
    );
    return;
  }

  const isFont = /fonts\.(googleapis|gstatic)\.com/.test(url.hostname);
  const isImageCdn = /images\.unsplash|cloudinary|imgbb|firebasestorage|googleusercontent/.test(url.hostname);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !isFont && !isImageCdn) return;

  event.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
