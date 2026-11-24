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

  await t.test('3. enterWorkspace menampilkan seed chart tanpa menghitung quant engine dua kali', () => {
    const start = appJs.indexOf('function enterWorkspace()');
    const end = appJs.indexOf("if (typeof window !== 'undefined') window.enterWorkspace", start);
    const body = appJs.slice(start, end);
    assert.ok(body.includes('fnSeed(state.symbol'), 'enterWorkspace menyiapkan seed candles sebagai preview');
    assert.ok(body.includes('renderSeedCandlesPreview(state.candles)'), 'seed hanya dirender sebagai preview ringan');
    assert.ok(!body.includes('computeQuantEngine('), 'seed tidak menjalankan quant engine sinkron saat masuk workspace');
  });

  await t.test('4. initChart menyembunyikan tvChartLoadingSkeleton pada semua kondisi mobile / fallback', () => {
    assert.ok(appJs.includes("if (sk) { try { sk.style.display = 'none'; } catch (e) {} }"), 'initChart menyembunyikan skeleton loader');
    assert.ok(appJs.includes('ResizeObserver'), 'initChart mengamati resize kontainer secara responsif');
  });

  await t.test('5. sw.js bebas dari TypeError respondWith(null) dan memuat aset locale i18n', () => {
    assert.ok(!swJs.includes('return cached || null;'), 'sw.js tidak boleh mengembalikan null ke respondWith');
    assert.ok(swJs.includes('/i18n/locales/id.json'), 'STATIC_ASSETS memuat locales id.json');
    assert.ok(swJs.includes('/i18n/locales/en.json'), 'STATIC_ASSETS memuat locales en.json');
    assert.ok(swJs.includes('xstarzg-pwa-v2026.88'), 'sw.js memiliki versi cache segar v2026.88');
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

  await t.test('20. radar auto-pilot berhenti saat workspace tersembunyi', () => {
    const pilotStart = appJs.indexOf('function startRadarAutoPilot()');
    const pilotEnd = appJs.indexOf('var __xsBootCoreStarted', pilotStart);
    const pilot = appJs.slice(pilotStart, pilotEnd);
    assert.ok(pilot.includes("workspace.classList.contains('hidden')"), 'auto-pilot memeriksa visibilitas workspace');
  });

  await t.test('21. quant/signal engine baru dimuat setelah workspace dibuka', () => {
    assert.ok(appJs.includes('function ensureQuantEnginesLoaded()'), 'lazy loader tersedia');
    assert.ok(appJs.includes('ensureQuantEnginesLoaded();'), 'workspace meminta engine');
    assert.ok(appJs.includes("bootScript.src = '/js/engine-boot.js?v=2026.88'"), 'modul engine tidak di-load dari landing');
  });
  await t.test('22. bootPostDom tidak menghitung seed saat landing/login', () => {
    const bootStart = appJs.indexOf('function bootPostDom()');
    const bootEnd = appJs.indexOf('// ==================== PWA INSTALL', bootStart);
    const bootBody = appJs.slice(bootStart, bootEnd);
    assert.ok(bootBody.includes('if (isInWork && (!state.candles || !state.candles.length))'), 'seed analysis hanya saat workspace aktif');
  });
  await t.test('23. auto-screening dan Best TF tidak berjalan di terminal utama', () => {
    const radarStart = appJs.indexOf('function renderOpportunityRadar(force)');
    const investorStart = appJs.indexOf('function renderInvestorPicks(force)');
    const tfStart = appJs.indexOf('function scheduleBestTfScan()');
    assert.ok(appJs.indexOf('return;', radarStart) < appJs.indexOf('rotatingSlice(catalogSortedStable()', radarStart), 'radar berhenti sebelum batch fetch');
    assert.ok(appJs.indexOf('return;', investorStart) < appJs.indexOf('rotatingSlice(investableUniverse()', investorStart), 'investor scan berhenti sebelum batch fetch');
    assert.ok(appJs.indexOf('return;', tfStart) < appJs.indexOf('var ALL_TFS =', tfStart), 'Best TF berhenti sebelum fetch delapan timeframe');
  });

  await t.test('24. vendor chart tidak dimuat sebelum workspace', () => {
    assert.ok(!appJs.includes('<script src="/vendor/lightweight-charts.js'), 'vendor chart tidak ada di app bootstrap HTML');
    assert.ok(appJs.includes("chartScript.src = '/vendor/lightweight-charts.js?v=2026.88'"), 'chart vendor dimuat saat entry workspace');
  });

  await t.test('25. pergantian timeframe tidak mengosongkan candle aktif', () => {
    const tfStart = appJs.indexOf("var tfBar = $id('timeframeBar')");
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
    assert.ok(body.includes("if (ctrl.signal && ctrl.signal.aborted) throw"), 'abort tidak memicu fallback compute');
  });
  await t.test('28. DEX scanner tetap tersedia dan dipanggil saat Meme mode dibuka', () => {
    assert.ok(appJs.includes("else if (mode === 'meme') { renderMemePicks(true); startMemeLiveTicker(); }"), 'Meme mode tetap merender scanner');
    assert.ok(appJs.includes("var url = '/api/scanner/meme?chain='"), 'endpoint DEX scanner tetap dipakai');
    assert.ok(appJs.includes('function fetchMemeCatalogLive(force)'), 'fungsi fetch DEX tetap ada');
  });
});
