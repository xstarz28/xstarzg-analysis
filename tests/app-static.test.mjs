// Static regression checks for manual instrument analysis, DEX contract inspection and journal monitoring.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const html = read('public/index.html');
const quant = read('public/js/shared/quant-core.js');
const signal = read('public/js/shared/signal-engine.js');
const dexApi = read('functions/api/dex/analyze.js');
const sentinel = read('scripts/market-sentinel.mjs');
const workflow = read('.github/workflows/market-sentinel.yml');
const sw = read('public/sw.js');
const engineBoot = read('public/js/engine-boot.js');
const css = read('public/styles.css');

test('XSTARZG MANUAL-ANALYSIS REGRESSION', async (t) => {
  await t.test('workspace startup is unique and does not fetch or analyse a default instrument', () => {
    assert.equal((app.match(/function enterWorkspace\(\)/g) || []).length, 1);
    assert.equal((app.match(/function showScreen\(name\)/g) || []).length, 1);
    const start = app.indexOf('function enterWorkspace()');
    const end = app.indexOf("if (typeof window !== 'undefined') window.enterWorkspace", start);
    const body = app.slice(start, end);
    assert.ok(body.includes('ensureChartVendorLoaded()'));
    assert.ok(body.includes('ensureQuantEnginesLoaded()'));
    assert.ok(body.includes('PILIH INSTRUMEN'));
    assert.ok(!body.includes('generateSeedCandles('));
    assert.ok(body.includes('if (hasManualInstrumentSelection && typeof window.runFullAnalysis'));
    assert.ok(!body.includes('generateSeedCandles('));
  });

  await t.test('analysis requires an explicit instrument selection', () => {
    assert.ok(app.includes('var hasManualInstrumentSelection = false;'));
    assert.ok(app.includes('if (!hasManualInstrumentSelection)'));
    assert.ok(app.includes('hasManualInstrumentSelection = true;'));
    assert.ok(app.includes('manualInstrumentSelected: hasManualInstrumentSelection === true'));
    assert.ok(app.includes('hasManualInstrumentSelection = saved.manualInstrumentSelected === true;'));
    assert.ok(app.includes("bind('btnAnalyzeInstrument'"));
    assert.ok(app.includes("bind('btnRunEngine'"));
  });

  await t.test('the selected symbol and selected timeframe are the only market-analysis request inputs', () => {
    assert.ok(app.includes('fetchRealMarketCandles(reqSymbol, reqTf, requestController)'));
    assert.ok(app.includes('mySeq !== analysisRequestSeq || state.symbol !== reqSymbol || state.tf !== reqTf'));
    assert.ok(app.includes('activeAnalysisController.abort()'));
    assert.ok(app.includes('if (typeof state === \'undefined\' || !state || !state.symbol || !hasManualInstrumentSelection) return;'));
  });

  await t.test('timeframe and instrument changes cancel stale work without cross-symbol candle reuse', () => {
    assert.ok(app.includes('let activeAnalysisController = null;'));
    assert.ok(app.includes('analysisRequestSeq'));
    assert.ok(app.includes('activeAnalysisController.abort()'));
    assert.ok(app.includes('isPriceCompatibleWithSymbol(lastBar.close, reqSymbol)'));
    assert.ok(app.includes('state.candles = [];'));
  });

  await t.test('radar, recommendation and cross-instrument screening entrypoints are removed', () => {
    for (const retired of [
      'RADAR_CONFIG', 'radarScanPool', 'investorScanPool', 'fetchRadarCandidate',
      'renderOpportunityRadar', 'renderInvestorPicks', 'writeBackRadarPools',
      'catalogSortedStable', 'rotatingSlice', 'scheduleBestTfScan', 'startRadarAutoPilot',
      'fetchMemeCatalogLive', 'DEFAULT_MEME_CATALOG', 'memeScanPool',
      '/api/scanner/meme', '/api/market/top-signals', '/api/macro/regime'
    ]) {
      assert.ok(!app.includes(retired), retired + ' must not exist in the main terminal');
    }
    assert.ok(!html.includes('id="memeRadarSection"'));
    assert.ok(!html.includes('id="memePicksGrid"'));
  });

  await t.test('DEX workspace requires a manually entered contract address and explicit Analyze action', () => {
    for (const id of ['selMemeChain', 'inpMemeTokenAddress', 'selMemeTf', 'btnAnalyzeMemeToken', 'memeFundGrid', 'memeTechBody']) {
      assert.ok(html.includes('id="' + id + '"'), id + ' is present');
    }
    assert.ok(app.includes("bind('btnAnalyzeMemeToken', analyzeDexToken)"));
    assert.ok(app.includes("fetch('/api/dex/analyze' + query"));
    assert.ok(app.includes('function dexAddressLooksValid('));
    assert.ok(app.includes('activeDexAbortController.abort()'));
    assert.ok(app.includes('requestId !== activeDexRequestSeq'));
  });

  await t.test('DEX data has source provenance and never claims a smart-contract audit', () => {
    assert.ok(dexApi.includes('api.dexscreener.com/token-pairs/v1/'));
    assert.ok(dexApi.includes('api.geckoterminal.com/api/v2/networks/'));
    assert.ok(dexApi.includes('ohlcv_list'));
    assert.ok(dexApi.includes("contractSecurity: 'NOT_VERIFIED'"));
    assert.ok(dexApi.includes('LP lock/burn'));
    assert.ok(dexApi.includes('mint/freeze authority'));
    assert.ok(app.includes('STATUS KEAMANAN KONTRAK: BELUM DIVERIFIKASI'));
  });

  await t.test('DEX technical indicators only use sourced OHLCV and do not fabricate missing candles', () => {
    assert.ok(app.includes('if (candles.length < 35 || !QC)'));
    assert.ok(app.includes('OHLCV valid belum tersedia'));
    for (const fn of ['calcEMA', 'calcRSI', 'calcATR', 'calcMACD', 'calcVWAP', 'calcBollinger', 'calcVolumeAndTpoProfile', 'detectModernInstitutionalStructure']) {
      assert.ok(quant.includes('export function ' + fn));
    }
    assert.ok(app.includes('dexRenderTechnicals(data)'));
    assert.ok(!app.includes('generateMemeCandles'));
  });

  await t.test('investor and DEX journals are user-entered records, not auto-seeded recommendations', () => {
    assert.ok(app.includes('function investorJournalStore()'));
    assert.ok(app.includes('function memeJournalStore()'));
    assert.ok(!app.includes('syncCuratedInvestorToJournal'));
    assert.ok(!app.includes('dex_rec_'));
    assert.ok(!app.includes('inv_bbca_spot'));
    assert.ok(!app.includes('inv_bbri_spot'));
    assert.ok(app.includes("source: 'MANUAL_ANALYSIS'"));
    assert.ok(app.includes("source: 'MANUAL_ENTRY'"));
  });

  await t.test('technical analysis and signal lifecycle tools remain available', () => {
    for (const fn of [
      'calcSMA', 'calcEMA', 'calcRSI', 'calcATR', 'calcMACD', 'calcBollinger',
      'calcVWAP', 'calcVolumeAndTpoProfile', 'detectSwingsNoLookahead',
      'detectModernInstitutionalStructure', 'runFullAnalysis', 'validateSignalLock',
      'applyLockedSignal', 'createSignalLock'
    ]) {
      assert.ok(quant.includes(fn) || signal.includes(fn) || app.includes(fn), fn + ' remains available');
    }
    assert.ok(app.includes('function monitorLiveSignalProgress('));
    assert.ok(app.includes('function recordSignalOutcome('));
    assert.ok(app.includes("localStorage.setItem(SIGNAL_OUTCOME_KEY"));
    assert.ok(app.includes('renderSignalJournal()'));
  });

  await t.test('fundamental and positioning metrics disclose unavailable providers instead of fabricating values', () => {
    assert.ok(signal.includes("fundamentalStatus: 'NOT_CONNECTED'"));
    assert.ok(signal.includes("cotStatus: 'NOT_CONNECTED'"));
    assert.ok(signal.includes('sourceVerified: false'));
    assert.ok(signal.includes('specLongPct: null'));
    assert.ok(app.includes("fc.sourceVerified === true"));
    assert.ok(app.includes('DATA BELUM TERHUBUNG'));
    assert.ok(app.includes('POSITIONING DATA UNAVAILABLE'));
    assert.ok(!/52 \+ biasShift/.test(signal));
    assert.ok(!/MVRV Z-Score: \$\{mvrv\}/.test(signal));
  });

  await t.test('cloud Sentinel only monitors active journal locks and cannot issue new entries', () => {
    assert.ok(sentinel.includes('for (const lock of Object.values(cache.slPlusLocks || {}))'));
    assert.ok(sentinel.includes('targetsByKey.set(sym + \'|\' + tf'));
    assert.ok(sentinel.includes('scanInstrument(inst, cache)'));
    assert.ok(sentinel.includes('const activeLock = cache.slPlusLocks[sym]'));
    assert.ok(sentinel.includes('SL+ (0-Risk Break-Even Plus Trigger)'));
    assert.ok(sentinel.includes("status: 'TP_HIT'") || sentinel.includes("'TP_HIT'"));
    assert.ok(sentinel.includes("status: 'SL_HIT'") || sentinel.includes("'SL_HIT'"));
    for (const retired of ['WATCHLIST', 'runFullAnalysis', 'signalEligible', 'MIN_SCORE', 'allowNewSignals', 'TOP_CRYPTO_SYMBOLS']) {
      assert.ok(!sentinel.includes(retired), retired + ' must be absent from cloud monitor');
    }
    assert.ok(!/cache\.slPlusLocks\[sym\]\s*=\s*lockObj/.test(sentinel));
    assert.ok(workflow.includes('XStarZG Position Journal Monitor'));
    assert.ok(!workflow.includes('SENTINEL_MIN_SCORE'));
  });

  await t.test('PWA and frontend cache versions are invalidated together', () => {
    assert.ok(html.includes('/app.js?v=2026.91'));
    assert.ok(app.includes('engine-boot.js?v=2026.91'));
    assert.ok(engineBoot.includes('quant-core.js?v=2026.91'));
    assert.ok(engineBoot.includes('signal-engine.js?v=2026.91'));
    assert.ok(sw.includes('xstarzg-pwa-v2026.91'));
  });

  await t.test('twenty locale bundles keep an identical UI keyset', async () => {
    const langs = ['id', 'en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'ar', 'ru', 'es', 'pt', 'fr', 'de', 'hi', 'tr', 'vi', 'th', 'ms', 'nl', 'it', 'pl'];
    const modules = await Promise.all(langs.map((lang) => import('../public/i18n/locales/' + lang + '.js')));
    const keys = Object.keys(modules[0].default.ui).sort().join('|');
    for (const mod of modules) assert.equal(Object.keys(mod.default.ui).sort().join('|'), keys);
  });

  await t.test('JavaScript syntax is valid for browser scripts, modules, APIs and Sentinel', () => {
    const classic = [
      'public/app.js',
      'tests/app-static.test.mjs',
      'tests/mobile-startup-and-i18n.test.mjs'
    ];
    const modules = [
      'public/js/calculator.js',
      'public/js/engine-boot.js',
      'public/js/shared/quant-core.js',
      'public/js/shared/signal-engine.js',
      'public/i18n/index.js',
      'public/i18n/boot.js',
      'functions/api/dex/analyze.js',
      'functions/api/market/analyze.js',
      'functions/api/news/calendar.js'
    ];
    for (const file of classic) execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
    for (const file of modules) {
      const source = read(file);
      execFileSync(process.execPath, ['--input-type=module', '--check'], { input: source, stdio: 'pipe' });
    }
    execFileSync(process.execPath, ['--check', path.join(root, 'scripts/market-sentinel.mjs')], { stdio: 'pipe' });
  });
});
