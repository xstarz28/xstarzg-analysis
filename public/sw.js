// XStarZG Mobile App Service Worker (PWA Offline / Standalone Cache)
// v2027.28 — analisis per kelompok (Sniper MTF) + cache baru.
// v2026.92 — PERBAIKAN KRITIS: cache lama tidak pernah dilepas.
// Penyebab web "di-deploy tapi masih hang": handler fetch lama mencocokkan aset
// dengan { ignoreSearch: true }, sehingga entri lama '/app.js' (tanpa query)
// SELALU menang atas '/app.js?v=...' yang baru. Akibatnya perangkat yang sudah
// pernah membuka situs terus menjalankan bundle lama (mesin rekomendasi radar
// yang berat) walaupun Cloudflare sudah men-deploy versi baru.
// Sekarang: aset dicocokkan PERSIS (termasuk ?v=), HTML selalu diambil dari
// jaringan lebih dulu (cache hanya fallback offline), dan versi cache dinaikkan
// agar seluruh perangkat lama dibersihkan sekali pada aktivasi berikutnya.
const CACHE_NAME = 'xstarzg-pwa-v2027.28';
// JANGAN precache JS/CSS tanpa query versi. Entri seperti '/app.js' dulu tersimpan
// dan (pada SW lama dengan ignoreSearch) bisa menang atas '/app.js?v=baru',
// sehingga perangkat terus menjalankan bundle lama setelah deploy.
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/assets/favicon.svg',
  '/assets/logo.svg',
  '/manifest.webmanifest'
];

const NAV_TIMEOUT_MS = 1200;

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
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Strategi cache:
// 1) /api/ + origin lain  -> network-only (kuotasi realtime & auth)
// 2) Navigasi (HTML)      -> network-first (maks 1200ms) + fallback cache offline
//    Deploy baru langsung terpakai; splash logo Android tetap tidak menggantung.
// 3) Aset statis          -> cache-first PERSIS (termasuk query ?v=) + revalidate
//    karena setiap rilis menaikkan ?v=, kunci cache ikut berubah -> tidak pernah
//    menyajikan bundle lama.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Hanya tangani same-origin request! Request ke origin lain (Binance, DexScreener, dll.) langsung ke jaringan
  if (url.origin !== location.origin) {
    return;
  }
  if (event.request.method !== 'GET') {
    return;
  }

  // Biarkan panggilan API market / auth selalu lewat jaringan (realtime)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  const isNavigation = event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html';

  if (isNavigation) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME).catch(() => null);
        const cached =
          (await caches.match('/', { ignoreSearch: true }).catch(() => null)) ||
          (await caches.match('/index.html', { ignoreSearch: true }).catch(() => null));

        const networkFetch = fetch(event.request).then((res) => {
          if (res && res.status === 200 && cache) {
            cache.put('/', res.clone()).catch(() => {});
            cache.put('/index.html', res.clone()).catch(() => {});
          }
          return res;
        });

        // Jaringan lebih dulu: HTML versi deploy terbaru selalu dipakai.
        try {
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAV_TIMEOUT_MS));
          const networkResponse = await Promise.race([networkFetch, timeoutPromise]);
          if (networkResponse && networkResponse.status === 200) return networkResponse;
        } catch (e) {
          // Jaringan lambat/offline -> sajikan cache agar splash tidak menggantung.
        }

        if (cached) return cached;

        try {
          const fallbackNet = await networkFetch;
          if (fallbackNet && fallbackNet.status === 200) return fallbackNet;
        } catch (e) {}
        return new Response('Network unavailable and no cached version found.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      })()
    );
    return;
  }

  // Kode aplikasi (JS/CSS) SELALU network-first: setelah deploy, bundle baru
  // langsung dipakai dan cache hanya menjadi cadangan saat offline. Ini menutup
  // celah "sudah deploy tapi HP masih menjalankan app.js lama".
  const isCode = /\.(js|css)$/i.test(url.pathname);
  if (isCode) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return networkResponse;
      }).catch(() =>
        caches.match(event.request, { ignoreSearch: true }).then((cached) =>
          cached || new Response('/* asset offline */', { status: 503 })
        )
      )
    );
    return;
  }

  // Aset statis lain (gambar/ikon): cocok PERSIS (tanpa ignoreSearch) lalu revalidate.
  event.respondWith(
    caches.match(event.request, { ignoreSearch: false }).then((cached) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return networkResponse;
      });

      if (cached) {
        // Aset versi ini sudah tersimpan: sajikan instan, perbarui di latar belakang.
        fetchPromise.catch(() => {});
        return cached;
      }
      // Belum ada di cache (URL/versi baru): ambil dari jaringan.
      return fetchPromise.catch(() => new Response('/* asset offline */', { status: 503 }));
    })
  );
});
