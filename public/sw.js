// XStarZG Mobile App Service Worker (PWA Offline / Standalone Cache)
const CACHE_NAME = 'xstarzg-pwa-v2026.75';
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
  '/assets/favicon.svg',
  '/assets/logo.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((asset) => cache.add(asset).catch(() => {}))
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
// 2) Navigation (HTML) -> Network-first (timeout 1800ms) with offline cache fallback
// 3) Static assets (.js, .css, images, fonts) -> Stale-while-revalidate (instant 0ms render + background update)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Biarkan panggilan API market / auth selalu lewat jaringan (realtime)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Permintaan navigasi (HTML halaman): Network-first agar saat ada update langsung muncul tanpa harus close/reopen
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      (async () => {
        try {
          const networkPromise = fetch(event.request);
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1800));
          const response = await Promise.race([networkPromise, timeoutPromise]);
          if (response && response.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put('/', response.clone()).catch(() => {});
            cache.put('/index.html', response.clone()).catch(() => {});
            return response;
          }
        } catch (e) {
          // Jaringan lambat / offline -> ambil dari cache instan
        }
        const cached = await caches.match('/', { ignoreSearch: true });
        if (cached) return cached;
        const cachedIndex = await caches.match('/index.html', { ignoreSearch: true });
        if (cachedIndex) return cachedIndex;
        return fetch(event.request);
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
      }).catch((err) => {
        // Jangan pernah kembalikan HTML untuk file JS/CSS saat offline/gagal!
        return cached || null;
      });

      return cached || fetchPromise;
    })
  );
});
