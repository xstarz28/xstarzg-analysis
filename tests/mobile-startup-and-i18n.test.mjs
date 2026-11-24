// Regression tests for startup safety on desktop, mobile PWA and APK/WebView.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const html = read('public/index.html');
const sw = read('public/sw.js');

test('MOBILE STARTUP — MANUAL ANALYSIS ONLY', async (t) => {
  await t.test('startup code is idempotent and only one workspace entry function exists', () => {
    assert.equal((app.match(/function enterWorkspace\(\)/g) || []).length, 1);
    assert.equal((app.match(/function showScreen\(name\)/g) || []).length, 1);
    assert.ok(app.includes('if (__xsBootCoreStarted) return;'));
  });

  await t.test('workspace entry creates a chart shell, not synthetic analysis', () => {
    const start = app.indexOf('function enterWorkspace()');
    const end = app.indexOf("if (typeof window !== 'undefined') window.enterWorkspace", start);
    const body = app.slice(start, end);
    assert.ok(body.includes('ensureChartVendorLoaded()'));
    assert.ok(body.includes('ensureQuantEnginesLoaded()'));
    assert.ok(body.includes('initChart()'));
    assert.ok(!body.includes('generateSeedCandles('));
    assert.ok(!body.includes('computeQuantEngine('));
    assert.ok(!body.includes('runFullAnalysis('));
  });

  await t.test('no initial market analysis without a manually selected instrument', () => {
    assert.ok(app.includes('var hasManualInstrumentSelection = false;'));
    assert.ok(app.includes('if (!hasManualInstrumentSelection)'));
    assert.ok(app.includes('hasManualInstrumentSelection = true;'));
    assert.ok(app.includes('manualInstrumentSelected: hasManualInstrumentSelection === true'));
    assert.ok(app.includes('hasManualInstrumentSelection = saved.manualInstrumentSelected === true;'));
  });

  await t.test('the chart vendor and quant engine remain lazy-loaded after workspace entry', () => {
    assert.ok(app.includes("chartScript.src = '/vendor/lightweight-charts.js?v=2026.91'"));
    assert.ok(app.includes("bootScript.src = '/js/engine-boot.js?v=2026.91'"));
    assert.ok(!html.includes('<script src="/vendor/lightweight-charts.js'));
    assert.ok(!html.includes('<script type="module" src="/js/engine-boot.js'));
  });

  await t.test('timeframe changes abort stale requests and keep last valid candle data', () => {
    assert.ok(app.includes('activeAnalysisController.abort()'));
    assert.ok(app.includes('analysisRequestSeq'));
    assert.ok(app.includes('mySeq !== analysisRequestSeq || state.symbol !== reqSymbol || state.tf !== reqTf'));
    const tfStart = app.indexOf("var tfBar = $id('timeframeBar')");
    const tfEnd = app.indexOf('/* ---- Pemilih tipe chart', tfStart);
    const handler = app.slice(tfStart, tfEnd);
    assert.ok(!handler.includes('state.candles = []'));
  });

  await t.test('no radar, investor scanner or DEX token catalogue is present', () => {
    for (const retired of [
      'renderOpportunityRadar', 'renderInvestorPicks', 'fetchRadarCandidate',
      'scheduleBestTfScan', 'startRadarAutoPilot', 'RADAR_CONFIG',
      'radarScanPool', 'investorScanPool', 'DEFAULT_MEME_CATALOG',
      'fetchMemeCatalogLive', 'memeScanPool'
    ]) assert.ok(!app.includes(retired), retired + ' must be retired');
    assert.ok(!html.includes('id="memePicksGrid"'));
    assert.ok(!html.includes('id="opportunityRadarGrid"'));
  });

  await t.test('DEX token analysis is triggered only by the explicit Analyze action', () => {
    assert.ok(html.includes('id="inpMemeTokenAddress"'));
    assert.ok(html.includes('id="btnAnalyzeMemeToken"'));
    assert.ok(app.includes("bind('btnAnalyzeMemeToken', analyzeDexToken)"));
    assert.ok(app.includes("fetch('/api/dex/analyze' + query"));
    assert.ok(!app.includes("'/api/scanner/meme"));
  });

  await t.test('realtime quote timer stays idle until a manual instrument selection exists', () => {
    assert.ok(app.includes('!state.symbol || !hasManualInstrumentSelection) return;'));
  });

  await t.test('PWA serves a fresh cache name after the manual-only refactor', () => {
    assert.ok(sw.includes("const CACHE_NAME = 'xstarzg-pwa-v2026.91';"));
    assert.ok(html.includes('/app.js?v=2026.91'));
  });
});
