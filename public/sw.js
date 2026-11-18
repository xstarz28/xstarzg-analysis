// XStarZG Mobile App Service Worker (PWA Offline / Standalone Cache)
const CACHE_NAME = 'xstarzg-pwa-v2026.70';
const STATIC_ASSETS = [
  '/',
  '/index.html?v=2026.68',
  '/styles.css?v=2026.68',
  '/app.js?v=2026.68',
  '/js/engine-boot.js?v=2026.68',
  '/i18n/boot.js?v=2026.68',
  '/assets/favicon.svg?v=2026.70',
  '/assets/logo.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first for static local assets, network-first for API market data
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Biarkan panggilan API market / auth selalu lewat jaringan (realtime)
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (response && response.status === 200 && event.request.method === 'GET' && url.origin === location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone)).catch(() => {});
        }
        return response;
      });
    }).catch(() => caches.match('/'))
  );
});
