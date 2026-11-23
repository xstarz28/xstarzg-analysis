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
    assert.ok(swJs.includes('xstarzg-pwa-v2026.76'), 'sw.js memiliki versi cache segar v2026.76');
  });

  await t.test('6. app.js controllerchange mencegah refresh loop pada kunjungan pertama', () => {
    assert.ok(appJs.includes('isInitialController'), 'app.js mengecek keberadaan controller awal sebelum reload');
  });
});
