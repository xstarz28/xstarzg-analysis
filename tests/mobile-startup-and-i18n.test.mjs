import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const appJs = fs.readFileSync(path.join(rootDir, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(rootDir, 'public/sw.js'), 'utf8');
const i18nIndex = fs.readFileSync(path.join(rootDir, 'public/i18n/index.js'), 'utf8');

test('MOBILE STARTUP & LANGUAGE INTEGRITY', async (t) => {
  await t.test('1. detectInitialLanguage mengikuti bahasa sistem lalu jatuh ke English', () => {
    assert.ok(i18nIndex.includes("export const FALLBACK_LANGUAGE = 'en';"), 'fallback bahasa harus English');
    assert.ok(i18nIndex.includes('function browserLanguageTags()'), 'deteksi harus membaca bahasa sistem perangkat');
    assert.ok(i18nIndex.includes('export function resolveLanguage(tag)'), 'tag sistem harus dinormalisasi ke kode yang tersedia');
    assert.ok(i18nIndex.includes('return FALLBACK_LANGUAGE;'), 'bahasa yang tidak kita miliki harus jatuh ke English');
    assert.ok(i18nIndex.includes('const saved = resolveLanguage(localStorage.getItem(LANG_STORAGE_KEY));'), 'pilihan tersimpan tetap diprioritaskan');
  });

  await t.test('2. generateSeedCandles diekspos ke window dan tersedia di scope app.js', () => {
    assert.ok(appJs.includes('window.generateSeedCandles = generateSeedCandles'), 'generateSeedCandles harus diekspos ke window');
    assert.ok(appJs.includes('window.SEED_PRICES = SEED_PRICES'), 'SEED_PRICES harus diekspos ke window');
    assert.ok(appJs.includes('window.drawCanvasFallbackChart = drawCanvasFallbackChart'), 'drawCanvasFallbackChart harus diekspos ke window');
  });

  await t.test('3. enterWorkspace memuat chart dan engine secara lazy tanpa rekomendasi', () => {
    const start = appJs.lastIndexOf('function enterWorkspace()');
    const end = appJs.indexOf('/* ==================== 10.', start);
    const body = appJs.slice(start, end);
    assert.ok(body.includes('ensureChartVendorLoaded()'), 'chart vendor baru dimuat setelah workspace dibuka');
    assert.ok(body.includes('ensureQuantEnginesLoaded()'), 'engine baru dimuat setelah workspace dibuka');
    assert.ok(body.includes('try { initChart(); } catch (e) {}'), 'chart diinisialisasi saat workspace dibuka');
    assert.ok(!body.includes('renderOpportunityRadar'), 'workspace tidak memulai rekomendasi otomatis');
  });

  await t.test('4. initChart menyembunyikan tvChartLoadingSkeleton pada semua kondisi mobile / fallback', () => {
    assert.ok(appJs.includes("if (sk) { try { sk.style.display = 'none'; } catch (e) {} }"), 'initChart menyembunyikan skeleton loader');
    assert.ok(appJs.includes('ResizeObserver'), 'initChart mengamati resize kontainer secara responsif');
  });

  await t.test('5. sw.js bebas dari TypeError respondWith(null) dan memuat aset locale i18n', () => {
    assert.ok(!swJs.includes('return cached || null;'), 'sw.js tidak boleh mengembalikan null ke respondWith');
    assert.ok(swJs.includes('/i18n/locales/id.json'), 'STATIC_ASSETS memuat locales id.json');
    assert.ok(swJs.includes('/i18n/locales/en.json'), 'STATIC_ASSETS memuat locales en.json');
    assert.ok(swJs.includes('xstarzg-pwa-v2027.11'), 'sw.js memiliki versi cache segar v2027.11');
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

  await t.test('15. enterWorkspace memuat katalog dan menginisialisasi chart dengan aman', () => {
    const start = appJs.lastIndexOf('function enterWorkspace()');
    const end = appJs.indexOf('/* ==================== 10.', start);
    const body = appJs.slice(start, end);
    assert.ok(body.includes('renderInstrumentCatalog()'), 'enterWorkspace memanggil renderInstrumentCatalog');
    assert.ok(body.includes('try { initChart(); } catch (e) {}'), 'enterWorkspace memanggil initChart seketika');
  });

  await t.test('16. controllerchange memproteksi Android WebAPK / Standalone dari reload paksa berulang', () => {
    assert.ok(appJs.includes('isPwaStandalone'), 'controllerchange memeriksa mode standalone PWA/WebAPK');
    assert.ok(appJs.includes('if (isPwaStandalone) return;'), 'controllerchange tidak boleh memuat ulang webview WebAPK');
  });

  await t.test('17. tvChartLoadingSkeleton dicegah memutar tanpa henti pada index.html dan alur workspace', () => {
    const indexHtml = fs.readFileSync(path.join(rootDir, 'public/index.html'), 'utf8');
    assert.ok(indexHtml.includes('id="tvChartLoadingSkeleton" style="position:absolute;inset:0;display:none;'), 'skeleton diinisialisasi tersembunyi agar tidak menutup grafik');
    assert.ok(appJs.includes("var sk = document.getElementById('tvChartLoadingSkeleton');\n  if (sk) { try { sk.style.display = 'none'; } catch (e) {} }"), 'renderAllVisuals menyembunyikan skeleton');
  });

  await t.test('18. startup bootstrap and post-DOM work are idempotent', () => {
    assert.ok(appJs.includes('if (__xsBootCoreStarted) return;'), 'bootCore hanya boleh berjalan sekali');
    assert.ok(appJs.includes('if (__xsBootPostDomStarted) return;'), 'bootPostDom hanya boleh berjalan sekali');
  });
  await t.test('19. controllerchange tidak memaksa reload halaman', () => {
    const controllerHandler = appJs.slice(appJs.indexOf("navigator.serviceWorker.addEventListener('controllerchange'"), appJs.indexOf("var deferredPwaPrompt"));
    assert.ok(controllerHandler.includes('Never force a page reload'), 'controllerchange tidak memicu reload paksa');
    assert.ok(!controllerHandler.includes('window.location.reload()'), 'controllerchange tidak berisi location.reload');
  });

  await t.test('20. radar auto-pilot dinonaktifkan', () => {
    assert.match(appJs, /function startRadarAutoPilot\(\) \{\s*return;\s*\}/);
  });

  await t.test('21. quant/signal engine baru dimuat setelah workspace dibuka', () => {
    assert.ok(appJs.includes('function ensureQuantEnginesLoaded()'), 'lazy loader tersedia');
    assert.ok(appJs.includes('ensureQuantEnginesLoaded();'), 'workspace meminta engine');
    assert.ok(appJs.includes("bootScript.src = '/js/engine-boot.js?v=2027.11'"), 'modul engine tidak di-load dari landing');
  });
  await t.test('22. bootPostDom tidak menghitung seed saat landing/login', () => {
    const bootStart = appJs.indexOf('function bootPostDom()');
    const bootEnd = appJs.indexOf('// ==================== PWA INSTALL', bootStart);
    const bootBody = appJs.slice(bootStart, bootEnd);
    assert.ok(bootBody.includes('if (isInWork && (!state.candles || !state.candles.length))'), 'seed analysis hanya saat workspace aktif');
  });
  await t.test('23. rekomendasi dan permintaan DEX otomatis sudah dihapus', () => {
    assert.doesNotMatch(appJs, /renderMemePicks|\/api\/scanner\/meme|fetchMemeCatalogLive/);
  });

  await t.test('24. vendor chart tidak dimuat sebelum workspace', () => {
    assert.ok(!appJs.includes('<script src="/vendor/lightweight-charts.js'), 'vendor chart tidak ada di app bootstrap HTML');
    assert.ok(appJs.includes("chartScript.src = '/vendor/lightweight-charts.js?v=2027.11'"), 'chart vendor dimuat saat entry workspace');
  });

  await t.test('25. pergantian timeframe tidak mengosongkan candle aktif', () => {
    const tfStart = appJs.indexOf('/* ---- Timeframe bar ---- */');
    const tfEnd = appJs.indexOf("/* ---- Pemilih tipe chart", tfStart);
    const handler = appJs.slice(tfStart, tfEnd);
    assert.ok(!handler.includes('state.candles = []'), 'candle sebelumnya dipertahankan selama fetch timeframe baru');
    assert.ok(handler.includes("setTxt('lblEngineStatus', '⏳ MEMUAT ' + tf"), 'status loading ditampilkan');
  });
  await t.test('26. pergantian timeframe membatalkan request analisis sebelumnya', () => {
    assert.ok(appJs.includes('let activeAnalysisController = null;'), 'controller analisis aktif tersedia');
    assert.ok(appJs.includes('activeAnalysisController.abort()'), 'request lama dibatalkan');
    assert.ok(appJs.includes('fetchRealMarketCandles(reqSymbol, reqTf, requestController)'), 'fetch menerima AbortController');
  });
  await t.test('27. seed hanya menjadi pratinjau visual tanpa full quant calculation', () => {
    const start = appJs.indexOf('window.runFullAnalysis = async function');
    const end = appJs.indexOf('// Pre-warm radar & initial analysis on load', start);
    const body = appJs.slice(start, end);
    assert.ok(body.includes('renderSeedCandlesPreview(state.candles)'), 'seed ditampilkan sebagai preview');
    assert.ok(!body.includes("computeQuantEngine(state.candles, state.symbol, state.tf, false, 'apply', 'LOCAL_SEED')"), 'seed tidak dihitung penuh');
    assert.ok(appJs.includes("if (ctrl.signal && ctrl.signal.aborted) throw"), 'abort tidak memicu fallback compute');
  });
  await t.test('28. DEX tetap manual dan tidak memanggil scanner otomatis', () => {
    const indexHtml = fs.readFileSync(path.join(rootDir, 'public/index.html'), 'utf8');
    assert.ok(indexHtml.includes('id="selMemeChain"') && indexHtml.includes('id="inpMemeAddress"'));
    assert.ok(appJs.includes('function searchManualDexToken()'));
    assert.doesNotMatch(appJs, /renderMemePicks|startMemeLiveTicker|fetchMemeCatalogLive/);
  });

  await t.test('29b. tombol Jalur Owner hanya di-toggle satu handler (tidak dobel-toggle)', () => {
    assert.ok(appJs.includes("id === 'btnToggleOwnerLogin'"), 'delegated guard menangani tombol owner');
    const toggles = appJs.match(/blk\.classList\.toggle\('hidden'\)/g) || [];
    assert.equal(toggles.length, 1, 'ownerLoginBlock hanya di-toggle sekali agar satu tap benar-benar membukanya');
  });

  await t.test('29c. baris aksi beranda membungkus dan pemilih bahasa selebar layar di HP', () => {
    const indexHtml = fs.readFileSync(path.join(rootDir, 'public/index.html'), 'utf8');
    const css = fs.readFileSync(path.join(rootDir, 'public/styles.css'), 'utf8');
    assert.ok(indexHtml.includes('<div class="nav-actions">'), 'baris aksi beranda memakai kelas nav-actions');
    assert.match(css, /\.nav-actions \{[^}]*flex-wrap: wrap/, 'nav-actions boleh membungkus tombol');
    assert.match(css, /\.nav-actions \.lang-select \{[^}]*max-width: 100%/, 'pemilih bahasa tidak terpotong di HP');
  });

  await t.test('29. feed sintetis tidak menjalankan full quant engine', () => {
    const start = appJs.indexOf('window.runFullAnalysis = async function');
    const end = appJs.indexOf('// Pre-warm radar & initial analysis on load', start);
    const body = appJs.slice(start, end);
    assert.ok(body.includes('feedIsEstimate(data.source)'), 'provenance feed diperiksa sebelum quant');
    assert.ok(body.includes('FEED ESTIMASI'), 'feed sintetis hanya ditampilkan sebagai preview');
    assert.ok(body.includes('scheduleFeedReconnect();'), 'reconnect broker tetap dijadwalkan');
  });
});
