// XStarZG Mobile App Service Worker (PWA Offline / Standalone Cache)
const CACHE_NAME = 'xstarzg-pwa-v2026.90';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
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
// 2) Navigation (HTML) -> Cache-first instan 0ms (anti-freeze logo WebAPK) + background revalidate
// 3) Static assets (.js, .css, vendor, images, fonts) -> Stale-while-revalidate murni (0ms delay instan + background update)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Hanya tangani same-origin request! Request ke origin lain (Binance, DexScreener, dll.) langsung ke jaringan
  if (url.origin !== location.origin) {
    return;
  }

  // Biarkan panggilan API market / auth selalu lewat jaringan (realtime)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Permintaan navigasi (HTML halaman): Sajikan dari cache seketika 0ms agar APK/PWA tidak menggantung di splash logo,
  // sambil memperbarui cache di latar belakang untuk kunjungan berikutnya
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      (async () => {
        // Cek cache lokal terlebih dahulu (0ms instant startup - anti-freeze logo WebAPK)
        const cached = (await caches.match(event.request, { ignoreSearch: true })) || (await caches.match('/', { ignoreSearch: true })) || (await caches.match('/index.html', { ignoreSearch: true }));

        // Background fetch untuk sinkronisasi versi HTML terbaru dari Cloudflare
        const networkFetch = fetch(event.request).then(async (res) => {
          if (res && res.status === 200) {
            try {
              const cache = await caches.open(CACHE_NAME);
              cache.put('/', res.clone()).catch(() => {});
              cache.put('/index.html', res.clone()).catch(() => {});
            } catch (ePut) {}
          }
          return res;
        }).catch(() => null);

        if (cached) {
          // Ada di cache: kembalikan langsung 0ms agar splash screen logo Android APK langsung tertutup!
          return cached;
        }

        // Belum pernah di-cache (kunjungan pertama kali tanpa cache): tunggu jaringan maks 1200ms
        try {
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1200));
          const networkResponse = await Promise.race([networkFetch, timeoutPromise]);
          if (networkResponse && networkResponse.status === 200) {
            return networkResponse;
          }
        } catch (e) {}

        const fallbackNet = await networkFetch;
        if (fallbackNet && fallbackNet.status === 200) return fallbackNet;
        return new Response('Network unavailable and no cached version found.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      })()
    );
    return;
  }

  // Aset statis lokal (.js, .css, vendor, gambar, font): Stale-While-Revalidate murni (0ms delay instan!)
  // Selalu sajikan dari cache lokal seketika (0ms!) agar seluruh script & layout langsung dieksekusi tanpa jeda jaringan,
  // lalu sinkronkan versi baru dari jaringan di latar belakang
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
      return fetchPromise.catch(() => new Response('/* asset offline */', { status: 503 }));
    })
  );
});
