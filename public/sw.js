// XStarZG Mobile App Service Worker (PWA Offline / Standalone Cache)
const CACHE_NAME = 'xstarzg-pwa-v2026.79';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/vendor/lightweight-charts.js',
  '/js/engine-boot.js',
  '/js/calculator.js',
  '/js/shared/quant-core.js',
  '/js/shared/signal-engine.js',
  '/i18n/boot.js',
  '/i18n/index.js',
  '/i18n/locales/id.json',
  '/i18n/locales/en.json',
  '/i18n/locales/id.js',
  '/i18n/locales/en.js',
  '/assets/favicon.svg',
  '/assets/logo.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((asset) =>
          fetch(new Request(asset, { cache: 'reload' }))
            .then((res) => { if (res.ok) return cache.put(asset, res); })
            .catch(() => {})
        )
      );
    })
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

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Cache strategy:
// 1) /api/ -> Network-only (realtime market quotes & auth)
// 2) Navigation (HTML) -> Network-first (timeout 1200ms) with instant offline cache fallback (anti-freeze di splash APK)
// 3) Static assets (.js, .css, images, fonts) -> Stale-while-revalidate (instant 0ms render + background update)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Biarkan panggilan API market / auth selalu lewat jaringan (realtime)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Permintaan navigasi (HTML halaman): Network-first cepat (1200ms) agar APK/PWA tidak menggantung di splash logo
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      (async () => {
        try {
          const networkPromise = fetch(event.request);
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1200));
          const networkResponse = await Promise.race([networkPromise, timeoutPromise]);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put('/', networkResponse.clone()).catch(() => {});
            cache.put('/index.html', networkResponse.clone()).catch(() => {});
            return networkResponse;
          }
        } catch (e) {
          // Jaringan lambat / timeout -> langsung gunakan cache seketika 0ms
        }
        const cached = (await caches.match('/', { ignoreSearch: true })) || (await caches.match('/index.html', { ignoreSearch: true }));
        if (cached) return cached;
        try {
          const fallbackNet = await fetch(event.request);
          if (fallbackNet && fallbackNet.status === 200) return fallbackNet;
        } catch (e2) {}
        return new Response('Network unavailable and no cached version found.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      })()
    );
    return;
  }

  // Aset statis lokal (.js, .css, gambar, font): Stale-While-Revalidate
  // Sajikan dari cache seketika (0ms!), lalu sinkronkan versi baru di latar belakang
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET' && url.origin === location.origin) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return networkResponse;
      });

      if (cached) {
        // Ada di cache lokal: sajikan seketika 0ms, perbarui cache di latar belakang
        fetchPromise.catch(() => {});
        return cached;
      }
      // Belum ada di cache: tunggu respon dari jaringan secara aman
      return fetchPromise;
    })
  );
});
