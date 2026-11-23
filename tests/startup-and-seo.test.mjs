import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const html = fs.readFileSync(path.join(rootDir, 'public/index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(rootDir, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(rootDir, 'public/sw.js'), 'utf8');
const headers = fs.readFileSync(path.join(rootDir, 'public/_headers'), 'utf8');
const sitemap = fs.readFileSync(path.join(rootDir, 'public/sitemap.xml'), 'utf8');
const robots = fs.readFileSync(path.join(rootDir, 'public/robots.txt'), 'utf8');

test('PWA & SERVICE WORKER: Solusi tuntas bug startup layar menggantung pasca update', async (t) => {
  await t.test('1. sw.js mengadopsi Network-First untuk permintaan navigasi HTML', () => {
    assert.ok(swJs.includes("event.request.mode === 'navigate'"), 'sw.js harus mendeteksi mode navigate');
    assert.ok(swJs.includes('Promise.race'), 'sw.js harus menggunakan timeout race untuk network-first navigasi');
  });

  await t.test('2. sw.js TIDAK BOLEH mengembalikan HTML untuk script JS / CSS yang gagal di-fetch', () => {
    // Pola lama: .catch(() => caches.match('/')) yang merusak tag script dengan SyntaxError
    assert.ok(!swJs.includes("caches.match('/').then"), 'Tidak boleh fallback membabi-buta ke HTML root');
    assert.ok(!swJs.includes("catch(() => caches.match('/'))"), 'Tidak boleh catch error fetch asset menjadi HTML');
  });

  await t.test('3. sw.js STATIC_ASSETS memuat lightweight-charts dan modul shared quant', () => {
    assert.ok(swJs.includes('/vendor/lightweight-charts.js'), 'lightweight-charts wajib ada di STATIC_ASSETS');
    assert.ok(swJs.includes('/js/shared/quant-core.js'), 'quant-core wajib ada di STATIC_ASSETS');
    assert.ok(swJs.includes('/js/shared/signal-engine.js'), 'signal-engine wajib ada di STATIC_ASSETS');
    assert.ok(swJs.includes('/js/calculator.js'), 'calculator wajib ada di STATIC_ASSETS');
  });

  await t.test('4. _headers mencegah Cloudflare/browser meng-cache sw.js dan index.html', () => {
    assert.ok(headers.includes('/sw.js'), '_headers wajib mengatur header /sw.js');
    assert.ok(headers.includes('no-cache, no-store, must-revalidate'), 'sw.js wajib no-cache no-store must-revalidate');
    assert.ok(headers.includes('/index.html'), '_headers wajib mengatur /index.html');
  });

  await t.test('5. app.js memantau controllerchange untuk reload otomatis pasca update', () => {
    assert.ok(appJs.includes('controllerchange'), 'app.js harus mendengarkan controllerchange');
    assert.ok(appJs.includes('window.location.reload()'), 'app.js reload otomatis saat SW baru aktif');
  });
});

test('MOBILE STARTUP & ZERO-DELAY CHART RENDERING', async (t) => {
  await t.test('1. index.html menghapus placeholder statis 4,055.00 dan menyediakan skeleton loader', () => {
    assert.ok(!html.includes('>4,055.00<'), 'index.html tidak boleh memuat harga statis 4,055.00');
    assert.ok(html.includes('id="tvChartLoadingSkeleton"'), 'index.html memuat skeleton loader di dalam chart container');
  });

  await t.test('2. app.js bootPostDom mengecek document.readyState !== loading', () => {
    assert.ok(appJs.includes('function bootPostDom'), 'app.js mendefinisikan bootPostDom');
    assert.ok(appJs.includes("document.readyState === 'loading'"), 'app.js mengecek readyState loading');
    assert.ok(appJs.includes('bootPostDom();'), 'app.js mengeksekusi langsung jika readyState sudah complete/interactive');
  });

  await t.test('3. enterWorkspace mengeksekusi instant pre-render terkalibrasi 0ms', () => {
    assert.ok(appJs.includes('Instant pre-render: Tampilkan harga terkalibrasi'), 'enterWorkspace memuat instant pre-render');
    assert.ok(appJs.includes("generateSeedCandles(state.symbol || 'XAU/USD'"), 'enterWorkspace mengalibrasi seed candles langsung');
  });

  await t.test('4. initChart & drawCanvasFallbackChart mencegah pitch-black void', () => {
    assert.ok(appJs.includes('oldCanvas.remove()'), 'initChart membersihkan fallback canvas saat chart instance siap');
    assert.ok(appJs.includes('tvChartLoadingSkeleton'), 'initChart menyembunyikan skeleton loader saat chart siap');
    assert.ok(appJs.includes('if (!container || (chartInstance && typeof LightweightCharts !=='), 'drawCanvasFallbackChart hanya diblokir bila chartInstance sudah aktif');
  });
});

test('GOOGLE SEARCH CONSOLE & SEO DISCOVERY CONFIGURATION', async (t) => {
  await t.test('1. index.html memuat rel="canonical" mengarah ke domain aktif xstarzg-analysis.pages.dev', () => {
    assert.ok(html.includes('<link rel="canonical" href="https://xstarzg-analysis.pages.dev/" />'), 'Canonical URL harus cocok dengan domain aktif');
    assert.ok(html.includes('<meta property="og:url" content="https://xstarzg-analysis.pages.dev/" />'), 'OG URL harus cocok dengan domain aktif');
  });

  await t.test('2. index.html memuat tag verifikasi Google Search Console', () => {
    assert.ok(html.includes('<meta name="google-site-verification" content="QK9_DVUmbva2pfdj4DWK_qWRlyWfKnrXWvYizARwA-o" />'), 'Google site verification meta tag harus ada');
  });

  await t.test('3. sitemap.xml dan robots.txt memprioritaskan xstarzg-analysis.pages.dev', () => {
    assert.ok(sitemap.includes('<loc>https://xstarzg-analysis.pages.dev/</loc>'), 'sitemap.xml memuat domain aktif');
    assert.ok(robots.includes('Sitemap: https://xstarzg-analysis.pages.dev/sitemap.xml'), 'robots.txt mereferensikan sitemap domain aktif');
  });
});
