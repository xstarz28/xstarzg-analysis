import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const appJs = fs.readFileSync(path.join(rootDir, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(rootDir, 'public/sw.js'), 'utf8');
const i18nIndex = fs.readFileSync(path.join(rootDir, 'public/i18n/index.js'), 'utf8');

test('MOBILE STARTUP & LANGUAGE INTEGRITY', async (t) => {
  await t.test('1. detectInitialLanguage default mutlak ke id (Bahasa Indonesia)', () => {
    assert.ok(i18nIndex.includes("return 'id';"), 'detectInitialLanguage harus default ke id');
    assert.ok(!i18nIndex.includes("const nav = (navigator.language"), 'detectInitialLanguage tidak boleh mendasarkan default pada navigator.language');
  });

  await t.test('2. generateSeedCandles diekspos ke window dan tersedia di scope app.js', () => {
    assert.ok(appJs.includes('window.generateSeedCandles = generateSeedCandles'), 'generateSeedCandles harus diekspos ke window');
    assert.ok(appJs.includes('window.SEED_PRICES = SEED_PRICES'), 'SEED_PRICES harus diekspos ke window');
    assert.ok(appJs.includes('window.drawCanvasFallbackChart = drawCanvasFallbackChart'), 'drawCanvasFallbackChart harus diekspos ke window');
  });

  await t.test('3. enterWorkspace memanggil seed candles tanpa crash dan merender visual instan', () => {
    assert.ok(appJs.includes('fnSeed(state.symbol'), 'enterWorkspace memanggil fnSeed dengan fallback aman');
    assert.ok(appJs.includes("renderAllVisuals(instant, true)"), 'enterWorkspace merender visual seketika 0ms');
  });

  await t.test('4. initChart menyembunyikan tvChartLoadingSkeleton pada semua kondisi mobile / fallback', () => {
    assert.ok(appJs.includes("if (sk) { try { sk.style.display = 'none'; } catch (e) {} }"), 'initChart menyembunyikan skeleton loader');
    assert.ok(appJs.includes('ResizeObserver'), 'initChart mengamati resize kontainer secara responsif');
  });

  await t.test('5. sw.js bebas dari TypeError respondWith(null) dan memuat aset locale i18n', () => {
    assert.ok(!swJs.includes('return cached || null;'), 'sw.js tidak boleh mengembalikan null ke respondWith');
    assert.ok(swJs.includes('/i18n/locales/id.json'), 'STATIC_ASSETS memuat locales id.json');
    assert.ok(swJs.includes('/i18n/locales/en.json'), 'STATIC_ASSETS memuat locales en.json');
    assert.ok(swJs.includes('xstarzg-pwa-v2026.80'), 'sw.js memiliki versi cache segar v2026.80');
  });

  await t.test('6. app.js controllerchange mencegah refresh loop pada kunjungan pertama', () => {
    assert.ok(appJs.includes('isInitialController'), 'app.js mengecek keberadaan controller awal sebelum reload');
  });

  await t.test('7. generateSeedCandles mengeksekusi langsung tanpa loop rekursi dan mengembalikan 180 candle', () => {
    assert.ok(appJs.includes('var SEED_PRICES = {'), 'app.js mendefinisikan SEED_PRICES di scope atas');
    assert.ok(!appJs.includes('if (typeof window !== \'undefined\' && typeof window.generateSeedCandles === \'function\') {\n    return window.generateSeedCandles'), 'generateSeedCandles tidak boleh memanggil dirinya sendiri melalui window');
  });

  await t.test('8. loginGateScreen menyediakan tombol jalur langsung Owner (btnGateOwnerDirect)', () => {
    const indexHtml = fs.readFileSync(path.join(rootDir, 'public/index.html'), 'utf8');
    assert.ok(indexHtml.includes('id="btnGateOwnerDirect"'), 'index.html memiliki tombol btnGateOwnerDirect');
    assert.ok(appJs.includes("bind('btnGateOwnerDirect'"), 'app.js mengikat event listener btnGateOwnerDirect');
  });

  await t.test('9. drawCanvasFallbackChart memiliki penjaga anti-rekursi', () => {
    assert.ok(appJs.includes('window.__canvasRenderer'), 'drawCanvasFallbackChart mendelegasikan render ke canvas renderer');
  });

  await t.test('10. app.js memuat deteksi dini PWA/APK dan delegated click capture guard', () => {
    assert.ok(appJs.includes('window.__isPwaLaunch = true'), 'app.js mendeteksi launch PWA/APK di baris awal');
    assert.ok(appJs.includes('btnHeroPreview'), 'delegated click listener menangani btnHeroPreview');
    assert.ok(appJs.includes('btnHeroLoginGate'), 'delegated click listener menangani btnHeroLoginGate');
    assert.ok(appJs.includes('btnGateOwnerDirect'), 'delegated click listener menangani btnGateOwnerDirect');
  });

  await t.test('11. sw.js memakai batas navigasi 1200ms dan cache: reload saat instalasi', () => {
    assert.ok(swJs.includes('1200'), 'sw.js membatasi timeout navigasi ke 1200ms');
    assert.ok(swJs.includes("cache: 'reload'"), 'sw.js install memakai cache: reload');
  });

  await t.test('12. _headers melarang caching Cloudflare edge untuk app.js, styles.css, js, dan i18n', () => {
    const headersFile = fs.readFileSync(path.join(rootDir, 'public/_headers'), 'utf8');
    assert.ok(headersFile.includes('/app.js'), '_headers mencakup /app.js');
    assert.ok(headersFile.includes('/styles.css'), '_headers mencakup /styles.css');
    assert.ok(headersFile.includes('no-cache, no-store, must-revalidate'), '_headers menerapkan no-cache');
  });

  await t.test('13. index.html memuat fallback option pada selInstrument dan data-lang-select', () => {
    const indexHtml = fs.readFileSync(path.join(rootDir, 'public/index.html'), 'utf8');
    assert.ok(indexHtml.includes('id="selInstrument"'), 'index.html memuat selInstrument');
    assert.ok(indexHtml.includes('<option value="XAU/USD" selected>'), 'selInstrument memuat fallback option XAU/USD');
    assert.ok(indexHtml.includes('<option value="id" selected>🇮🇩 Bahasa Indonesia</option>'), 'data-lang-select memuat fallback option ID');
  });

  await t.test('14. index.html menyediakan harga dan level terkalibrasi realistis bukan placeholder strip kosong', () => {
    const indexHtml = fs.readFileSync(path.join(rootDir, 'public/index.html'), 'utf8');
    assert.ok(indexHtml.includes('id="hdrLivePrice" class="live-price-big">2,680.00</span>'), 'hdrLivePrice memuat kuotasi terkalibrasi');
    assert.ok(indexHtml.includes('id="valEntry" class="val" style="color:#38bdf8;font-size:16px;">2,680.00</span>'), 'valEntry memuat level terkalibrasi');
  });

  await t.test('15. enterWorkspace memanggil renderInstrumentCatalog dan initChart secara sinkron', () => {
    assert.ok(appJs.includes('renderInstrumentCatalog()'), 'enterWorkspace memanggil renderInstrumentCatalog');
    assert.ok(appJs.includes('try { initChart(); } catch (eInit) {}'), 'enterWorkspace memanggil initChart seketika');
  });
});
