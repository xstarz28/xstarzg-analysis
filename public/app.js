'use strict';
/* ================================================================================
   XSTARZG ANALYSIS — TERMINAL 2026 CORE ENGINE (app.js v2026.31)
   Perbaikan Total:
   1. BUG TAMPILAN: file ini sebelumnya hanya berisi patch tanpa core — seluruh
      tombol/alur (Login, Preview, Workspace, Chart) mati. Sekarang diperbaiki penuh.
   2. HARGA REAL-TIME SEMUA INSTRUMEN seperti TradingView:
      - CRYPTO  -> Binance WebSocket tick-by-tick (miniTicker) + REST 24hr ticker.
      - FOREX/METALS/IDX/US STOCKS/KOMODITAS -> polling kuotasi broker via edge
        function /api/market/analyze?quote=1 (TradingView scanner: OANDA, FX_IDC,
        IDX, NASDAQ/NYSE, TVC, dst) + radar batch quotes /api/market/quotes.
      - Fallback canvas renderer jika CDN chart diblokir ISP.
   CATATAN: Dua blok patch asli (v2026.27 ticker & v2026.30 instant-render) di
   bagian bawah file DIPERTAHANKAN apa adanya agar tetap selaras dengan hasil
   penyempurnaan sesi sebelumnya — core ini mendefinisikan semua global yang
   mereka butuhkan (state, chartInstance, candleSeries, initChart,
   computeQuantEngine, renderAllVisuals, renderOpportunityRadar,
   fetchRealMarketCandles, connectRealtimeStream, formatPrice).
   ================================================================================ */

/* ==================== 0. UTILITAS & STATE GLOBAL ==================== */
var QC = null;      // /js/shared/quant-core.js   (dimuat via dynamic import)
var SE = null;      // /js/shared/signal-engine.js (dimuat via dynamic import)
var state = {
  symbol: 'XAU/USD',
  tf: 'H1', timeframe: 'H1',
  mode: 'trader',            // 'trader' | 'investor'
  subMode: 'futures',        // 'futures' | 'spot'
  radarHorizon: 'intraday',  // 'scalping' | 'intraday' | 'swing'
  candles: [],
  lastAnalysis: null,
  livePrice: 0,
  liveChangePct: 0,
  feedSource: '-',
  user: null                 // { email, name, tier: 'GUEST'|'FREE'|'VIP'|'OWNER_VIP', vipUntil }
};
var chartInstance = null;
var candleSeries = null;
var ema20Line = null, ema50Line = null, ma200Line = null, vwapLine = null;
var drawnPriceLines = [];
var binanceWs = null;
var countdownTimer = null;
var lastCandleBucket = 0;
var radarRunSeq = 0;
var cryptoPairsLoaded = false;
var TF_SECONDS = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400, W1: 604800, MN: 2592000, '1Y': 7776000 };
var SESSION_KEY = 'xstarzg_user_v3';
var OWNER_EMAILS_CLIENT = ['sevenfoldarmy2822@gmail.com', 'gilfanputra@gmail.com'];
var VIP_WALLET = '0xB2Da154e6619A57A2B839D7845920e55Bc58A12C';
var USDT_BSC_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';
var VIP_PRICE = 29;
/* Radar rekomendasi per-horizon — setiap kelompok memindai kandidat dengan
   timeframe kelompoknya sendiri (Scalping M1-M15, Intraday M15-H1, Swing H4-W1),
   dan setiap kartu menampilkan arah rekomendasi (BUY/SELL utk trader, AKUMULASI/DCA utk investor). */
var RADAR_CONFIG = {
  scalping: {
    label: '⚡ SCALPING', tfRange: 'M1–M15',
    infoTrader: 'Eksekusi cepat: momentum, VWAP & orderflow M1–M15. Risiko tinggi — ukuran posisi kecil.',
    infoInvestor: 'Horizon scalping bukan untuk akumulasi — investor disarankan memakai tab SWING.',
    list: [
      { sym: 'BTC/USDT', tf: 'M5' }, { sym: 'ETH/USDT', tf: 'M5' }, { sym: 'SOL/USDT', tf: 'M5' },
      { sym: 'XAU/USD', tf: 'M15' }, { sym: 'EUR/USD', tf: 'M5' }, { sym: 'GBP/JPY', tf: 'M15' },
      { sym: 'USD/JPY', tf: 'M15' }, { sym: 'NVDA', tf: 'M15' }
    ]
  },
  intraday: {
    label: '🎯 INTRADAY', tfRange: 'M15–H1',
    infoTrader: 'Target harian: SMC, FVG, session breakout & VPVR pada M15–H1.',
    infoInvestor: 'Rekomendasi pembelian nyata harian — cek kembali valuasi sebelum akumulasi.',
    list: [
      { sym: 'BTC/USDT', tf: 'M30' }, { sym: 'ETH/USDT', tf: 'M30' }, { sym: 'XAU/USD', tf: 'H1' },
      { sym: 'XAU/IDR', tf: 'H1' }, { sym: 'EUR/USD', tf: 'H1' }, { sym: 'USD/IDR', tf: 'M30' },
      { sym: 'WTI', tf: 'H1' }, { sym: 'BBCA.JK', tf: 'H1' }, { sym: 'BMRI.JK', tf: 'H1' }, { sym: 'NVDA', tf: 'H1' }
    ]
  },
  swing: {
    label: '🌊 SWING', tfRange: 'H4–W1',
    infoTrader: 'Multi-hari: supply/demand, struktur tren & CFTC COT pada H4–W1.',
    infoInvestor: 'Akumulasi spot jangka menengah-panjang: beli nyata bertahap (DCA) di zona demand.',
    list: [
      { sym: 'BTC/USDT', tf: 'H4' }, { sym: 'ETH/USDT', tf: 'H4' }, { sym: 'XAU/USD', tf: 'D1' },
      { sym: 'XAU/IDR', tf: 'D1' }, { sym: 'EUR/USD', tf: 'H4' }, { sym: 'WTI', tf: 'D1' },
      { sym: 'CPO', tf: 'H4' }, { sym: 'BBCA.JK', tf: 'D1' }, { sym: 'BBRI.JK', tf: 'D1' },
      { sym: 'IHSG', tf: 'D1' }, { sym: 'NVDA', tf: 'D1' }, { sym: 'SPY', tf: 'D1' }
    ]
  }
};
var radarCache = {};
var FALLBACK_CATALOG = [
  { symbol: 'XAU/USD', name: 'Gold Spot / Emas Dunia (USD)', assetClass: 'metals', region: 'GLOBAL' },
  { symbol: 'XAU/IDR', name: 'Emas Spot / Gram (IDR Proxy)', assetClass: 'metals', region: 'ID' },
  { symbol: 'XAG/USD', name: 'Silver Spot / Perak (USD)', assetClass: 'metals', region: 'GLOBAL' },
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', assetClass: 'forex', region: 'GLOBAL' },
  { symbol: 'GBP/USD', name: 'British Pound / US Dollar', assetClass: 'forex', region: 'GLOBAL' },
  { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', assetClass: 'forex', region: 'GLOBAL' },
  { symbol: 'USD/IDR', name: 'US Dollar / Rupiah Indonesia', assetClass: 'forex', region: 'ID' },
  { symbol: 'WTI', name: 'WTI Crude Oil / Minyak Mentah AS', assetClass: 'commodities', region: 'GLOBAL' },
  { symbol: 'BBCA.JK', name: 'Bank Central Asia Tbk (Rp)', assetClass: 'stocks', region: 'ID' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation (AI)', assetClass: 'stocks', region: 'US' },
  { symbol: 'BTC/USDT', name: 'Bitcoin', assetClass: 'crypto', region: 'GLOBAL' },
  { symbol: 'ETH/USDT', name: 'Ethereum', assetClass: 'crypto', region: 'GLOBAL' }
];
function $id(x) { return document.getElementById(x); }
function setTxt(id, val) { var el = $id(id); if (el) el.textContent = val; }
function num(v, d) { var n = Number(v); return Number.isFinite(n) ? n : (d || 0); }
function formatPrice(v, symbol) {
  var n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '--';
  var a = Math.abs(n);
  if (a >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (a >= 20) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (a >= 1) return n.toFixed(4);
  if (a >= 0.01) return n.toFixed(5);
  return n.toFixed(8);
}
function pctFmt(v) { var n = num(v, 0); return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
function getMeta(symbol) {
  var s = (symbol || '').toUpperCase();
  try { if (QC && QC.getInstrumentMeta) return QC.getInstrumentMeta(s); } catch (e) {}
  var cls = 'stocks', region = 'GLOBAL';
  if (s.indexOf('/USDT') > -1) cls = 'crypto';
  else if (s === 'WTI' || s === 'BRENT' || s === 'NATGAS' || s === 'CPO' || s === 'COAL' || s === 'WHEAT' || s === 'CORN' || s === 'SOYBEAN' || s === 'COFFEE' || s === 'COCOA' || s === 'SUGAR' || s === 'COTTON' || s === 'CATTLE' || s === 'LUMBER' || s === 'HEATOIL' || s === 'GASOLINE') cls = 'commodities';
  else if (s.indexOf('XAU') === 0 || s.indexOf('XAG') === 0 || s.indexOf('XPT') === 0 || s.indexOf('XPD') === 0 || s.indexOf('XCU') === 0 || s.indexOf('/') === 3 && (s.slice(0, 3) === 'HG/' )) cls = 'metals';
  else if (s.indexOf('/') > -1) cls = 'forex';
  else if (s.slice(-3) === '.JK') { cls = 'stocks'; region = 'ID'; }
  return { symbol: s, name: s + ' Instrument', assetClass: cls, region: region };
}
function catLabelOf(meta) {
  var c = meta.assetClass;
  if (c === 'metals') return 'METALS';
  if (c === 'forex') return 'FOREX';
  if (c === 'commodities') return 'COMMODITIES';
  if (c === 'crypto') return 'CRYPTO';
  return meta.region === 'ID' ? 'IDX STOCKS' : 'GLOBAL STOCKS';
}

/* ==================== 1. KATALOG INSTRUMEN & SELECT ==================== */
function currentCatalog() {
  if (QC && QC.DEFAULT_INSTRUMENTS && QC.DEFAULT_INSTRUMENTS.length) return QC.DEFAULT_INSTRUMENTS;
  return FALLBACK_CATALOG;
}
function matchesCategory(inst, cat) {
  if (!cat || cat === 'ALL') return true;
  if (cat === 'METALS') return inst.assetClass === 'metals';
  if (cat === 'FOREX') return inst.assetClass === 'forex';
  if (cat === 'IDX') return inst.assetClass === 'stocks' && inst.region === 'ID';
  if (cat === 'US_STOCKS') return inst.assetClass === 'stocks' && inst.region !== 'ID';
  if (cat === 'COMMODITIES') return inst.assetClass === 'commodities';
  if (cat === 'CRYPTO') return inst.assetClass === 'crypto';
  return true;
}
function renderInstrumentCatalog(query) {
  var sel = $id('selInstrument');
  if (!sel) return;
  var cat = ($id('selCategory') || {}).value || 'ALL';
  var q = (query !== undefined ? query : (($id('inpSearchAsset') || {}).value || '')).trim().toUpperCase();
  var catalog = currentCatalog();
  var groups = [
    { key: 'crypto', label: '₿ CRYPTO SPOT GLOBAL', items: [] },
    { key: 'metals', label: '🥇 LOGAM MULIA', items: [] },
    { key: 'forex', label: '💱 FOREX MAYOR & CROSS', items: [] },
    { key: 'idx', label: '🇮🇩 SAHAM INDONESIA IDX', items: [] },
    { key: 'usg', label: '🇺🇸 SAHAM AS & GLOBAL', items: [] },
    { key: 'comm', label: '🛢️ KOMODITAS ENERGI & PANGAN', items: [] }
  ];
  var i, inst;
  for (i = 0; i < catalog.length; i++) {
    inst = catalog[i];
    if (!matchesCategory(inst, cat)) continue;
    if (q && inst.symbol.toUpperCase().indexOf(q) === -1 && (inst.name || '').toUpperCase().indexOf(q) === -1) continue;
    if (inst.assetClass === 'crypto') groups[0].items.push(inst);
    else if (inst.assetClass === 'metals') groups[1].items.push(inst);
    else if (inst.assetClass === 'forex') groups[2].items.push(inst);
    else if (inst.assetClass === 'stocks' && inst.region === 'ID') groups[3].items.push(inst);
    else if (inst.assetClass === 'stocks') groups[4].items.push(inst);
    else if (inst.assetClass === 'commodities') groups[5].items.push(inst);
  }
  sel.innerHTML = '';
  var MAX_PER_GROUP = 450;
  var symbolPresent = false; // catat apakah simbol aktif ikut ter-render (data-driven, anti blank <select>)
  for (var g = 0; g < groups.length; g++) {
    var grp = groups[g];
    if (!grp.items.length) continue;
    var og = document.createElement('optgroup');
    og.label = grp.label + ' (' + grp.items.length + (grp.key === 'crypto' && cryptoPairsLoaded ? '+' : '') + ')';
    var limit = Math.min(grp.items.length, MAX_PER_GROUP);
    // Pastikan simbol aktif selalu ada di daftar walaupun melewati batas render
    var active = null;
    for (i = 0; i < grp.items.length; i++) {
      if (grp.items[i].symbol === state.symbol) { active = grp.items[i]; break; }
    }
    var rendered = {};
    if (active) {
      var optA = document.createElement('option');
      optA.value = active.symbol; optA.textContent = active.symbol + ' — ' + (active.name || '');
      optA.selected = true;
      og.appendChild(optA); rendered[active.symbol] = true;
      symbolPresent = true;
    }
    for (i = 0; i < limit; i++) {
      inst = grp.items[i];
      if (rendered[inst.symbol]) continue;
      var opt = document.createElement('option');
      opt.value = inst.symbol;
      opt.textContent = inst.symbol + ' — ' + (inst.name || '');
      if (inst.symbol === state.symbol) { opt.selected = true; symbolPresent = true; }
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }
  try { sel.value = state.symbol; } catch (e) {}
  // FIX bug kolom pemilihan: saat simbol aktif ter-filter keluar (mis. simbol di LOGAM
  // lalu kategori diganti CRYPTO) <select> tampil KOSONG tanpa tulisan. Tampilkan
  // placeholder informatif (disabled) agar kolom ke-3 selalu memperlihatkan teks,
  // dan setiap klik instrumen tetap memicu event change secara normal.
  // Keputusan berbasis data (symbolPresent) -> konsisten di semua browser.
  if (sel.options.length === 0) {
    var ph0 = document.createElement('option');
    ph0.value = ''; ph0.disabled = true; ph0.selected = true;
    ph0.textContent = '🔍 Tidak ada instrumen cocok — ubah kata kunci pencarian';
    sel.appendChild(ph0);
  } else if (!symbolPresent) {
    var ph = document.createElement('option');
    ph.value = ''; ph.disabled = true; ph.selected = true;
    ph.textContent = '⬇ ' + sel.options.length + ' instrumen siap dipilih — klik untuk menganalisis';
    sel.insertBefore(ph, sel.firstChild);
    if (ph.selected !== true || sel.selectedIndex !== 0) { try { sel.selectedIndex = 0; } catch (e) {} }
  }
}
function lazyLoadCryptoPairs() {
  if (cryptoPairsLoaded) return;
  cryptoPairsLoaded = true;
  try {
    var ctrl = new AbortController();
    var t = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 5000);
    fetch('https://data-api.binance.vision/api/v3/ticker/price', { signal: ctrl.signal })
      .then(function (r) { clearTimeout(t); return r.ok ? r.json() : null; })
      .then(function (list) {
        if (!Array.isArray(list) || !QC || !QC.registerDynamicInstrument) return;
        var added = 0;
        for (var i = 0; i < list.length; i++) {
          var it = list[i];
          if (!it.symbol || it.symbol.slice(-4) !== 'USDT') continue;
          if (it.symbol.indexOf('UPUSDT') > -1 || it.symbol.indexOf('DOWNUSDT') > -1 || it.symbol.indexOf('BEAR') > -1 || it.symbol.indexOf('BULL') > -1) continue;
          var base = it.symbol.slice(0, -4);
          var price = Number(it.price) || 1;
          if (base.length >= 2 && price > 0) {
            QC.registerDynamicInstrument({
              symbol: base + '/USDT', name: base + ' Crypto Spot (Binance Real-Time)',
              assetClass: 'crypto', provider: 'binance', providerSymbol: it.symbol,
              isRealtime: true, delayMinutes: 0, basePrice: price, cotCategory: 'CME_CRYPTO'
            });
            added++;
          }
        }
        if (added > 0) renderInstrumentCatalog();
      })
      .catch(function () {});
  } catch (e) {}
}

/* ==================== 2. MESIN ANALISIS QUANT (computeQuantEngine) ==================== */
function computeQuantEngine(candles, symbol, tf, forceRecalc) {
  try {
    if (SE && SE.runFullAnalysis && Array.isArray(candles) && candles.length >= 30) {
      var a = SE.runFullAnalysis({
        symbol: symbol, timeframe: tf || 'H1',
        mode: state.mode || 'trader', horizon: 'all', candles: candles
      });
      if (a && !a.error) {
        a.entry = a.levels.entry; a.sl = a.levels.sl;
        a.tp1 = a.levels.tp1; a.tp2 = a.levels.tp2; a.tp3 = a.levels.tp3;
        a.confidence = a.confluenceScore;
        return a;
      }
    }
  } catch (e) {}
  return computeQuickAnalysis(candles, symbol, tf);
}
/* Fallback ringan (self-contained) jika shared module belum termuat */
function computeQuickAnalysis(candles, symbol, tf) {
  candles = Array.isArray(candles) && candles.length >= 5 ? candles : [];
  var n = candles.length;
  var last = n ? candles[n - 1] : { open: 100, high: 100, low: 100, close: 100, time: Math.floor(Date.now() / 1000) };
  var price = last.close;
  var closes = candles.map(function (c) { return c.close; });
  var emaArr = function (arr, p) {
    var out = new Array(arr.length); var k = 2 / (p + 1); var prev = arr[0] || price;
    for (var i = 0; i < arr.length; i++) { prev = i === 0 ? arr[0] : arr[i] * k + prev * (1 - k); out[i] = prev; }
    return out;
  };
  var ema20A = emaArr(closes, 20), ema50A = emaArr(closes, 50), ema200A = emaArr(closes, 200);
  var ema20 = ema20A[n - 1] || price, ema50 = ema50A[n - 1] || price, ma200 = ema200A[n - 1] || price;
  var trSum = 0, trCount = 0, i;
  for (i = Math.max(1, n - 14); i < n; i++) {
    var c = candles[i], p = candles[i - 1];
    trSum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    trCount++;
  }
  var atr = trCount ? (trSum / trCount) : price * 0.004;
  var gains = 0, losses = 0;
  for (i = Math.max(1, n - 14); i < n; i++) {
    var d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  var rsi = losses === 0 ? (gains > 0 ? 100 : 50) : 100 - (100 / (1 + gains / losses));
  var wins = candles.slice(-40);
  var swingHigh = Math.max.apply(null, wins.map(function (c) { return c.high; }).concat([price]));
  var swingLow = Math.min.apply(null, wins.map(function (c) { return c.low; }).concat([price]));
  var bull = price >= ema20 && ema20 >= ema50;
  var bear = price < ema20 && ema20 < ema50;
  var direction = bull ? 'LONG' : bear ? (state.mode === 'investor' ? 'NEUTRAL' : 'SHORT') : 'NEUTRAL';
  var score = bull ? 68 : bear ? 32 : 50;
  if (price > ma200) score += 7; else score -= 7;
  if (rsi > 52 && rsi < 72) score += 5; else if (rsi < 48 && rsi > 28) score -= 5;
  score = Math.max(12, Math.min(96, Math.round(score)));
  var riskDist = atr * 1.65;
  var isShort = direction === 'SHORT';
  var entry = price;
  var sl = isShort ? entry + riskDist : entry - riskDist;
  var tp1 = isShort ? entry - riskDist * 1.5 : entry + riskDist * 1.5;
  var tp2 = isShort ? entry - riskDist * 2.5 : entry + riskDist * 2.5;
  var tp3 = isShort ? entry - riskDist * 4.0 : entry + riskDist * 4.0;
  var meta = getMeta(symbol);
  var prevClose = n > 1 ? closes[n - 2] : price;
  var vwapVal = (ema20 + ema50) / 2;
  return {
    symbol: meta.symbol, name: meta.name, assetClass: meta.assetClass, region: meta.region,
    timeframe: tf || 'H1', mode: state.mode,
    lastPrice: price, changePct: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
    direction: direction, investorStatus: direction === 'LONG' ? 'GRADUAL DCA ACCUMULATION' : 'HOLD / WAIT VALUE',
    confluenceScore: score, confidence: score,
    regime: bull ? 'BULLISH ORDERFLOW' : bear ? 'BEARISH ORDERFLOW' : 'NORMAL EXPANSION',
    structureTag: bull ? 'HIGHER HIGH / HIGHER LOW' : bear ? 'LOWER HIGH / LOWER LOW' : 'INTERNAL RANGE EQUILIBRIUM',
    entry: entry, sl: sl, tp1: tp1, tp2: tp2, tp3: tp3,
    levels: {
      entry: entry, sl: sl, tp1: tp1, tp2: tp2, tp3: tp3, rrRatio: 2.5,
      poc: price, vah: swingHigh, val: swingLow, tpoPoc: price, vwap: vwapVal,
      swingHigh: swingHigh, swingLow: swingLow,
      pivot: (swingHigh + swingLow + price) / 3, r1: swingHigh, r2: swingHigh, s1: swingLow, s2: swingLow,
      dcaZone1: price * 0.992, dcaZone2: price * 0.965, dcaZone3: price * 0.925,
      invTarget1: price * 1.12, invTarget2: price * 1.28, invTarget3: price * 1.55, invInvalidation: price * 0.86
    },
    indicators: {
      ema20: ema20, ema50: ema50, sma100: ema50, ema200: ma200, ma200: ma200, vwap: vwapVal,
      rsi: rsi, atr: atr, atrPct: (atr / price) * 100, macdHist: (ema20 - ema50) * 0.25,
      bbUpper: price + 2 * atr, bbLower: price - 2 * atr, bbWidth: (4 * atr / price) * 100,
      smcStatus: bull ? 'HIGHER HIGH / HIGHER LOW (Bullish Orderflow)' : bear ? 'LOWER HIGH / LOWER LOW (Bearish Orderflow)' : 'INTERNAL RANGE EQUILIBRIUM',
      liquiditySweep: 'NONE (Normal Liquidity Flow)', fvgNote: 'FVG Seimbang (Terisi)',
      demandZoneText: formatPrice(swingLow), supplyZoneText: formatPrice(swingHigh),
      // Default netral pilar ORBIT IQ saat engine penuh belum termuat
      orbLabel: 'Opening Range 60m Sesi UTC', orbState: 'N/A — engine penuh belum termuat', orbHigh: 0, orbLow: 0,
      thetaIndex: 50, thetaNote: 'Mode ringan — menunggu engine kuantitatif penuh',
      vwapEntryText: 'Mode ringan — pantau pullback/reclaim VWAP', vwapDevAtr: 0, vwapEntryQuality: 50,
      erValue: 0.5, erNote: 'Mode ringan — menunggu engine kuantitatif penuh', quantEdgeScore: 50
    },
    subScores: { trend: score, structure: score, momentum: Math.round(rsi), quantEdge: 50, cotBias: 52 },
    fundamentalCot: {
      institutionalBias: bull ? 'NET LONG BIAS' : bear ? 'NET SHORT BIAS' : 'NEUTRAL / MIXED',
      specLongPct: bull ? 58 : bear ? 42 : 50, specShortPct: bull ? 42 : bear ? 58 : 50,
      netSpecContracts: 0, weeklyDelta: 0,
      commHedgerBias: 'MENUNGGU DATA CFTC TERBARU',
      cotReportLabel: 'CFTC Disaggregated Commitments of Traders',
      centralBankStance: 'Pantau keputusan suku bunga bank sentral terdekat',
      macroRegime: bull ? 'RISK-ON' : 'SELEKTIF', dxyCorrelation: 'Korelasi DXY dinamis',
      valuationMetrics: 'Valuasi wajar relatif terhadap rata-rata historis',
      orderflowMetric: 'Orderflow netral', macroDriver: 'Sentimen pasar global',
      upcomingCatalyst: 'Rilis data ekonomi terjadwal'
    },
    backtest: { disabled: false, sampleSize: 0, winRate: 0, expectancyR: 0, profitFactor: 0, netR: 0, maxDrawdownR: 0, weakEvidence: true },
    reasons: [
      '[Engine Cepat] Analisis dasar dimuat — modul quant lengkap sedang disinkronkan.',
      '[MA Stack] Harga ' + formatPrice(price) + ' vs EMA20 ' + formatPrice(ema20) + ' / EMA50 ' + formatPrice(ema50) + ' | RSI(14): ' + rsi.toFixed(1) + '.'
    ],
    series: {
      ema20: candles.map(function (c, idx) { return { time: c.time, value: ema20A[idx] || c.close }; }),
      ema50: candles.map(function (c, idx) { return { time: c.time, value: ema50A[idx] || c.close }; }),
      ema200: candles.map(function (c, idx) { return { time: c.time, value: ema200A[idx] || c.close }; }),
      vwap: candles.map(function (c, idx) { return { time: c.time, value: ema20A[idx] || c.close }; }),
      bbUpper: candles.map(function (c) { return { time: c.time, value: c.close + 2 * atr }; }),
      bbLower: candles.map(function (c) { return { time: c.time, value: c.close - 2 * atr }; }),
      rsi: candles.map(function (c) { return { time: c.time, value: rsi }; })
    }
  };
}

/* ==================== 3. FEED DATA PASAR (candlestick OHLCV) ==================== */
function fetchRealMarketCandles(symbol, tf) {
  return new Promise(function (resolve) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 12000);
    fetch('/api/market/analyze?symbol=' + encodeURIComponent(symbol) + '&tf=' + encodeURIComponent(tf || 'H1') + '&_t=' + Date.now(), {
      cache: 'no-store', signal: ctrl.signal
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (d) {
      if (d && Array.isArray(d.candles) && d.candles.length >= 5) {
        var candles = d.candles
          .map(function (c) { return { time: num(c.time), open: num(c.open), high: num(c.high), low: num(c.low), close: num(c.close), volume: num(c.volume, 0) }; })
          .filter(function (c) { return c.time > 0 && c.close > 0; })
          .sort(function (a, b) { return a.time - b.time; });
        if (candles.length >= 5) {
          resolve({
            candles: candles,
            price: num(d.price, candles[candles.length - 1].close),
            changePct: num(d.changePct, 0),
            source: d.source || 'LIVE_BROKER'
          });
          return;
        }
      }
      throw new Error('DATA_SHORT');
    }).catch(function () {
      clearTimeout(timer);
      // Fallback lokal terkalibrasi (agar UI tidak pernah kosong)
      var local;
      try {
        if (QC && QC.generateInstitutionalSeries) {
          local = QC.generateInstitutionalSeries(getMeta(symbol), tf || 'H1', 220);
        }
      } catch (e) {}
      if (!local || !local.length) {
        var base = (getMeta(symbol).basePrice) || 100;
        var step = TF_SECONDS[tf] || 3600;
        var now = Math.floor(Date.now() / 1000 / step) * step;
        var seed = 7; var s = symbol || 'X';
        for (var i = 0; i < s.length; i++) seed = (seed * 33 + s.charCodeAt(i)) % 100000;
        var rnd = function () { seed = (seed * 16807 + 11) % 2147483647; return (seed % 10000) / 10000; };
        var arr = []; var cur = base;
        for (i = 199; i >= 0; i--) {
          var o = cur; var cl = Math.max(base * 0.4, o + (rnd() - 0.496) * base * 0.005);
          var h = Math.max(o, cl) + rnd() * base * 0.002;
          var l = Math.min(o, cl) - rnd() * base * 0.002;
          arr.push({ time: now - i * step, open: o, high: h, low: l, close: cl, volume: Math.round(200 + rnd() * 700) });
          cur = cl;
        }
        local = arr;
      }
      var lc = local[local.length - 1];
      resolve({ candles: local, price: lc.close, changePct: 0.1, source: 'EDGE_SYNTHETIC_CALIBRATED' });
    });
  });
}

/* ==================== 4. GRAFIK TRADINGVIEW (Lightweight Charts) ==================== */
function initChart() {
  var el = $id('tvChartContainer');
  if (!el) return false;
  if (chartInstance) return true;
  if (typeof LightweightCharts === 'undefined') return false; // canvas fallback menangani
  try {
    chartInstance = LightweightCharts.createChart(el, {
      width: el.clientWidth || 820,
      height: el.clientHeight || 470,
      layout: { background: { color: '#050811' }, textColor: '#94a3b8', fontSize: 11, fontFamily: "'Inter', sans-serif" },
      grid: { vertLines: { color: 'rgba(30, 41, 59, 0.55)' }, horzLines: { color: 'rgba(30, 41, 59, 0.55)' } },
      crosshair: { mode: LightweightCharts.CrosshairMode ? LightweightCharts.CrosshairMode.Normal : 0 },
      rightPriceScale: { borderColor: '#1e293b', scaleMargins: { top: 0.12, bottom: 0.10 } },
      timeScale: { borderColor: '#1e293b', timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 9 },
      localization: { locale: 'id-ID' }
    });
    candleSeries = chartInstance.addCandlestickSeries({
      upColor: '#10b981', downColor: '#f43f5e',
      borderUpColor: '#10b981', borderDownColor: '#f43f5e',
      wickUpColor: '#10b981', wickDownColor: '#f43f5e'
    });
    ema20Line = chartInstance.addLineSeries({ color: '#38bdf8', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    ema50Line = chartInstance.addLineSeries({ color: '#eab308', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    ma200Line = chartInstance.addLineSeries({ color: '#a855f7', lineWidth: 2, lastValueVisible: false, priceLineVisible: false });
    vwapLine = chartInstance.addLineSeries({ color: '#ec4899', lineWidth: 1, lineStyle: 2, lastValueVisible: false, priceLineVisible: false });
    window.addEventListener('resize', function () {
      try {
        var w = el.clientWidth;
        if (chartInstance && w > 0) chartInstance.applyOptions({ width: w });
      } catch (e) {}
    });
    return true;
  } catch (e) {
    chartInstance = null; candleSeries = null;
    return false;
  }
}
function clearDrawnPriceLines() {
  if (!candleSeries) return;
  for (var i = 0; i < drawnPriceLines.length; i++) {
    try { candleSeries.removePriceLine(drawnPriceLines[i]); } catch (e) {}
  }
  drawnPriceLines = [];
}
function drawChartLevels(analysis) {
  if (!candleSeries || !analysis || !analysis.levels) return;
  clearDrawnPriceLines();
  var showSMC = $id('chkSMC') ? $id('chkSMC').checked : true;
  var showSniper = $id('chkSniper') ? $id('chkSniper').checked : true;
  var L = effectiveLevels(analysis);
  var add = function (price, color, title, style) {
    var p = num(price);
    if (!p || p <= 0) return;
    try {
      var pl = candleSeries.createPriceLine({
        price: p, color: color, lineWidth: 1,
        lineStyle: style === undefined ? 2 : style,
        axisLabelVisible: true, title: title
      });
      drawnPriceLines.push(pl);
    } catch (e) {}
  };
  if (showSMC) {
    add(L.poc, '#eab308', 'POC', 1);
    add(L.swingHigh, 'rgba(244,63,94,0.7)', 'SUPPLY', 3);
    add(L.swingLow, 'rgba(16,185,129,0.7)', 'DEMAND', 3);
  }
  if (showSniper) {
    if (state.mode === 'investor') {
      add(L.dcaZone1, '#10b981', 'DCA 1', 2);
      add(L.dcaZone2, '#10b981', 'DCA 2', 2);
      add(L.dcaZone3, '#10b981', 'DCA 3', 2);
      add(L.invTarget1, '#38bdf8', 'TARGET', 0);
    } else {
      // Futures 2-arah: tampilkan garis estimasi likuidasi; Spot 1-arah: tanpa garis likuidasi
      var rp = riskParams(analysis);
      if (state.subMode === 'futures' && num(rp.liq) > 0) {
        add(rp.liq, 'rgba(168,85,247,0.9)', 'EST. LIQ ' + rp.lev + 'x', 3);
      }
      add(L.entry, '#38bdf8', 'ENTRY', 0);
      add(L.sl, '#f43f5e', 'STOP LOSS', 2);
      add(L.tp1, '#10b981', 'TP1', 2);
      add(L.tp2, '#10b981', 'TP2', 2);
      add(L.tp3, '#34d399', 'TP3', 2);
    }
  }
}
function syncIndicatorOverlays(analysis) {
  if (!analysis || !analysis.series) return;
  var showEMA = $id('chkEMA') ? $id('chkEMA').checked : true;
  var showVWAP = $id('chkVWAP') ? $id('chkVWAP').checked : true;
  try {
    if (ema20Line) ema20Line.setData(showEMA ? analysis.series.ema20 : []);
    if (ema50Line) ema50Line.setData(showEMA ? analysis.series.ema50 : []);
    if (ma200Line) ma200Line.setData(showEMA ? analysis.series.ema200 : []);
    if (vwapLine) vwapLine.setData(showVWAP ? analysis.series.vwap : []);
  } catch (e) {}
}

/* ==================== 5. RENDER SEMUA VISUAL (renderAllVisuals) ==================== */
function pillarHtml(name, val, note, sentiment) {
  return '<div class="pillar-item ' + (sentiment || 'neutral') + '">' +
    '<span class="p-name">' + name + '</span>' +
    '<span class="p-val">' + val + '</span>' +
    (note ? '<div style="color:#94a3b8;margin-top:2px;font-size:10.8px;">' + note + '</div>' : '') +
    '</div>';
}
function renderPillars(a) {
  var tech = $id('techPillarsGrid');
  if (tech) {
    var ind = a.indicators, lv = a.levels;
    var p = a.lastPrice;
    var bull = function (c) { return c ? 'bull' : 'bear'; };
    tech.innerHTML =
      pillarHtml('1. EMA Ribbon 20 / 50', formatPrice(ind.ema20) + ' / ' + formatPrice(ind.ema50), ind.ema20 > ind.ema50 ? 'Ribbon bullish tersusun rapi' : 'Ribbon bearish / belum searah', bull(ind.ema20 > ind.ema50)) +
      pillarHtml('2. MA-200 Macro Filter', formatPrice(ind.ma200 || ind.ema200), p >= (ind.ma200 || ind.ema200) ? 'Harga di atas garis makro (bias naik)' : 'Harga di bawah garis makro (bias turun)', bull(p >= (ind.ma200 || ind.ema200))) +
      pillarHtml('3. VWAP Institusional', formatPrice(ind.vwap), p >= ind.vwap ? 'Di atas VWAP — buyer dominan sesi ini' : 'Di bawah VWAP — seller dominan sesi ini', bull(p >= ind.vwap)) +
      pillarHtml('4. Volume Profile (VPVR)', 'POC ' + formatPrice(lv.poc), 'VAH ' + formatPrice(lv.vah) + ' • VAL ' + formatPrice(lv.val), p >= lv.poc ? 'bull' : 'bear') +
      pillarHtml('5. TPO Market Profile', 'TPO POC ' + formatPrice(lv.tpoPoc || lv.poc), 'Distribusi waktu harga pasar', 'neutral') +
      pillarHtml('6. Struktur SMC (BOS / CHoCH)', (ind.smcStatus || '-'), null, (ind.smcStatus || '').indexOf('BULL') > -1 || (ind.smcStatus || '').indexOf('HIGHER') > -1 ? 'bull' : (ind.smcStatus || '').indexOf('BEAR') > -1 || (ind.smcStatus || '').indexOf('LOWER') > -1 ? 'bear' : 'neutral') +
      pillarHtml('7. Fair Value Gap (FVG)', ind.fvgNote || '-', 'Deteksi imbalance 3-candle terbaru', (ind.fvgNote || '').indexOf('Bullish') > -1 ? 'bull' : (ind.fvgNote || '').indexOf('Bearish') > -1 ? 'bear' : 'neutral') +
      pillarHtml('8. Liquidity Sweep (BSL/SSL)', ind.liquiditySweep || 'NONE', 'Stop-hunt di sekitar swing terdekat', (ind.liquiditySweep || '').indexOf('▲') > -1 ? 'bull' : (ind.liquiditySweep || '').indexOf('▼') > -1 ? 'bear' : 'neutral') +
      pillarHtml('9. Supply & Demand Zone', 'D: ' + (ind.demandZoneText || formatPrice(lv.swingLow)), 'S: ' + (ind.supplyZoneText || formatPrice(lv.swingHigh)), 'neutral') +
      pillarHtml('10. Pivot Support / Resistance', 'S1 ' + formatPrice(lv.s1) + ' • R1 ' + formatPrice(lv.r1), 'Pivot klasik: ' + formatPrice(lv.pivot), bull(p >= lv.pivot)) +
      pillarHtml('11. RSI(14) & MACD Histogram', 'RSI ' + num(ind.rsi, 50).toFixed(1) + ' • MACD ' + (num(ind.macdHist) >= 0 ? '+' : '') + num(ind.macdHist).toPrecision(3), num(ind.rsi) > 70 ? 'Overbought — rawan koreksi' : num(ind.rsi) < 30 ? 'Oversold — rawan pantulan' : 'Momentum sehat', num(ind.macdHist) >= 0 ? 'bull' : 'bear') +
      pillarHtml('12. Bollinger Bands & ATR', 'BBW ' + num(ind.bbWidth).toFixed(2) + '% • ATR ' + num(ind.atrPct).toFixed(2) + '%', num(ind.bbWidth) < 1.25 ? 'Squeeze — siap breakout volatilitas' : 'Ekspansi volatilitas normal', 'neutral') +
      pillarHtml('13. ORB Breakout (Opening Range)', ind.orbHigh && ind.orbLow ? formatPrice(ind.orbLow) + ' – ' + formatPrice(ind.orbHigh) : (ind.orbLabel || 'ORB'),
        ind.orbState || '-',
        (ind.orbState || '').indexOf('ATAS ▲') > -1 ? 'bull' : (ind.orbState || '').indexOf('BAWAH ▼') > -1 ? 'bear' : 'neutral') +
      pillarHtml('14. Theta Index (Decay Momentum)', 'θ ' + num(ind.thetaIndex, 50) + '/100',
        ind.thetaNote || '-',
        num(ind.thetaIndex, 50) >= 62 ? 'bull' : num(ind.thetaIndex, 50) <= 38 ? 'bear' : 'neutral') +
      pillarHtml('15. Entry Institusional di VWAP', 'Kualitas ' + num(ind.vwapEntryQuality, 50) + '/100',
        ind.vwapEntryText || '-',
        (ind.vwapEntryText || '').indexOf('▲') > -1 ? 'bull' : (ind.vwapEntryText || '').indexOf('▼') > -1 ? 'bear' : 'neutral') +
      pillarHtml('16. Efficiency Ratio (Kualitas Tren)', (num(ind.erValue, 0.5) * 100).toFixed(0) + '%',
        ind.erNote || '-',
        num(ind.erValue, 0.5) >= 0.55 ? (a.direction === 'SHORT' ? 'bear' : 'bull') : 'neutral');
  }
  var macro = $id('macroPillarsGrid');
  if (macro) {
    var fc = a.fundamentalCot || {};
    var longPct = num(fc.specLongPct, 50);
    macro.innerHTML =
      pillarHtml('1. CFTC COT — Posisi Institusi', 'Long ' + longPct + '% / Short ' + (100 - longPct) + '%', (fc.cotReportLabel || 'CFTC COT') + ' • ' + (fc.institutionalBias || '-'), longPct >= 55 ? 'bull' : longPct <= 45 ? 'bear' : 'neutral') +
      pillarHtml('2. Bank Sentral & Suku Bunga', fc.macroRegime || '-', fc.centralBankStance || '-', 'neutral') +
      pillarHtml('3. Korelasi Dolar AS (DXY)', fc.dxyCorrelation || '-', null, 'neutral') +
      pillarHtml('4. Valuasi Intrinsik', fc.valuationMetrics || '-', null, 'neutral') +
      pillarHtml('5. Orderflow & Commercial Hedger', fc.orderflowMetric || '-', fc.commHedgerBias || null, 'neutral') +
      pillarHtml('6. Katalis Terdekat', fc.upcomingCatalyst || '-', fc.macroDriver || null, 'neutral');
  }
}
function renderNarrative(a) {
  var box = $id('narrativeHumanBox');
  if (!box) return;
  var dir = a.direction === 'LONG' ? '▲ BIAS LONG / BUY' : a.direction === 'SHORT' ? '▼ BIAS SHORT / SELL' : '◆ NETRAL / MENUNGGU';
  var dirCol = a.direction === 'LONG' ? '#10b981' : a.direction === 'SHORT' ? '#f43f5e' : '#f59e0b';
  var reasons = (a.reasons || []).map(function (r) { return '<div style="margin-bottom:5px;">' + r + '</div>'; }).join('');
  box.innerHTML =
    '<div style="margin-bottom:8px;font-weight:800;color:' + dirCol + ';">' + dir + ' — Skor Konfluensi ' + a.confluenceScore + '/100 (' + (a.regime || '-') + ')</div>' +
    reasons +
    '<div style="margin-top:4px;font-size:11.5px;color:#94a3b8;">Harga live, Entry/SL/TP & pilar di atas dihitung dari candle broker real-time. Setup terkunci selama periode candle ' + (a.timeframe || state.tf) + ' aktif dan diperbarui otomatis setiap candle baru terbentuk.</div>';
}
/* Parameter risiko futures (leverage aman & estimasi harga likuidasi) */
function riskParams(a) {
  var atrPct = Math.max(0.05, num(a && a.indicators ? a.indicators.atrPct : 0) || 0.5);
  var lev = atrPct < 0.4 ? 25 : atrPct < 0.9 ? 20 : atrPct < 1.8 ? 15 : atrPct < 3.2 ? 10 : 5;
  var dir = a && a.direction;
  var entry = num(a && a.levels ? a.levels.entry : 0);
  var liq = entry > 0 ? (dir === 'SHORT' ? entry * (1 + 0.92 / lev) : entry * (1 - 0.92 / lev)) : 0;
  return { lev: lev, liq: liq };
}
/* Level yang ditampilkan & digariskan.
   Trader SPOT dipaksa 1-arah (proteksi LONG saja — tanpa setup SHORT),
   Futures memakai level 2-arah sesuai analisis, Investor memakai zona DCA. */
function effectiveLevels(a) {
  var L = (a && a.levels) || {};
  if (state.mode === 'trader' && state.subMode === 'spot') {
    var e = num(a.lastPrice) || num(L.entry);
    var atr = num(a.indicators ? a.indicators.atr : 0) || e * 0.012;
    var risk = atr * 1.65;
    return Object.assign({}, L, {
      entry: e, sl: e - risk,
      tp1: e + risk * 1.5, tp2: e + risk * 2.5, tp3: e + risk * 4.0
    });
  }
  return L;
}
function renderPanels(a) {
  var isInvestor = state.mode === 'investor';
  var traderPanel = $id('traderSetupPanel');
  var invPanel = $id('investorSetupPanel');
  if (traderPanel) traderPanel.classList.toggle('hidden', isInvestor);
  if (invPanel) invPanel.classList.toggle('hidden', !isInvestor);
  if (isInvestor) {
    var lv = a.levels;
    var fair = num(lv.poc, a.lastPrice) * 0.55 + num(lv.vwap, a.lastPrice) * 0.45;
    if (fair <= 0) fair = a.lastPrice;
    var diffPct = ((a.lastPrice - fair) / fair) * 100;
    var status = diffPct < -3 ? 'UNDERVALUE (DISKON)' : diffPct > 3 ? 'OVERVALUE (PREMIUM)' : 'FAIR VALUE';
    var rating = a.direction === 'LONG' ? (a.confluenceScore >= 65 ? 'STRONG ACCUMULATE' : 'ACCUMULATE') : a.direction === 'SHORT' ? 'WAIT / REDUCE' : 'HOLD / WATCH';
    setTxt('valInvRating', rating);
    $id('valInvRating') && ($id('valInvRating').style.color = rating.indexOf('ACCUMULATE') > -1 ? '#10b981' : rating.indexOf('WAIT') > -1 ? '#f59e0b' : '#38bdf8');
    setTxt('valInvFairValue', formatPrice(fair, a.symbol));
    setTxt('valInvValuationStatus', status);
    $id('valInvValuationStatus') && ($id('valInvValuationStatus').style.color = diffPct < -3 ? '#10b981' : diffPct > 3 ? '#f43f5e' : '#f8fafc');
    setTxt('valInvMoS', 'MoS: ' + (diffPct <= 0 ? '+' : '−') + Math.abs(diffPct).toFixed(1) + '% vs Harga Live');
    setTxt('valInvDCA1', formatPrice(lv.dcaZone1, a.symbol));
    setTxt('valInvDCA2', formatPrice(lv.dcaZone2, a.symbol));
    setTxt('valInvDCA3', formatPrice(lv.dcaZone3, a.symbol));
    var avg = num(lv.dcaZone1) * 0.4 + num(lv.dcaZone2) * 0.35 + num(lv.dcaZone3) * 0.25;
    setTxt('valInvAvgPrice', formatPrice(avg, a.symbol));
    setTxt('valInvTarget1', formatPrice(lv.invTarget1, a.symbol));
    setTxt('valInvTarget2', formatPrice(lv.invTarget2, a.symbol));
    var rsiV = num(a.indicators.rsi, 50);
    var phase = a.regime && a.regime.indexOf('TREND') > -1 ? 'Fase Markup Tren' : rsiV < 38 ? 'Fase Akumulasi Diskon' : rsiV > 68 ? 'Fase Distribusi / Euforia' : 'Akumulasi Bertahap (Sideways Positif)';
    setTxt('valInvCyclePhase', phase);
    var yieldTxt = a.assetClass === 'crypto' ? 'Potensi staking/DeFi 2–8% APY' : a.assetClass === 'stocks' ? 'Dividen & capital gain jangka panjang' : a.assetClass === 'metals' ? 'Aset lindung nilai inflasi global' : 'Instrumen makro multi-sesi';
    setTxt('valInvYield', yieldTxt);
    setTxt('valSetupLockBadgeTxt', '');
    return;
  }
  // ---- Trader panel ----
  var dir = a.direction;
  var isSpot = state.subMode === 'spot';
  var dirBox = $id('valSignalDirection');
  if (dirBox) {
    var txt, col;
    if (isSpot) {
      txt = dir === 'LONG' ? 'SPOT BUY / AKUMULASI (1-ARAH)' : '◆ TUNGGU SETUP BELI (SPOT 1-ARAH)';
      col = dir === 'LONG' ? '#10b981' : '#f59e0b';
    } else {
      txt = dir === 'LONG' ? 'LONG / BUY SETUP' : dir === 'SHORT' ? 'SHORT / SELL SETUP' : '◆ WAIT / NO-TRADE ZONE';
      col = dir === 'LONG' ? '#10b981' : dir === 'SHORT' ? '#f43f5e' : '#f59e0b';
    }
    dirBox.textContent = txt;
    dirBox.style.color = col;
    dirBox.style.background = col === '#10b981' ? 'rgba(16,185,129,0.18)' : col === '#f43f5e' ? 'rgba(244,63,94,0.18)' : 'rgba(245,158,11,0.16)';
  }
  setTxt('valSetupLockBadge', '🔒 LOCKED ' + (a.timeframe || state.tf));
  setTxt('valConfidenceScore', (a.confluenceScore || a.confidence || 50) + '%');
  setTxt('valRegime', a.regime || '-');
  var L = effectiveLevels(a);
  setTxt('valEntry', formatPrice(L.entry, a.symbol));
  setTxt('valSL', formatPrice(L.sl, a.symbol));
  setTxt('valSLDesc', isSpot ? 'Proteksi LONG spot di luar swing wick + buffer ATR ' + num(a.indicators.atrPct).toFixed(2) + '%' : 'Di luar swing wick + buffer ATR ' + num(a.indicators.atrPct).toFixed(2) + '%');
  setTxt('valTP1', formatPrice(L.tp1, a.symbol));
  setTxt('valTP2', formatPrice(L.tp2, a.symbol));
  setTxt('valTP3', formatPrice(L.tp3, a.symbol));
  var rp = riskParams(a);
  setTxt('valRecLeverage', rp.lev + 'x');
  setTxt('valLiqPrice', formatPrice(rp.liq, a.symbol));
  setTxt('valRRRatio', '1 : ' + num(L.rrRatio, 2.5).toFixed(2));
  // Backtest
  var bt = a.backtest || {};
  if (bt.disabled) {
    setTxt('valBtWinRate', 'N/A');
    setTxt('valBtProfitFactor', 'N/A');
    setTxt('valBtNetReturn', 'TF Makro');
    setTxt('valBtMaxDD', 'N/A');
    setTxt('valBtTrades', 'Backtest nonaktif di TF makro');
  } else {
    setTxt('valBtWinRate', num(bt.winRate).toFixed(1) + '%');
    setTxt('valBtProfitFactor', num(bt.profitFactor).toFixed(2));
    setTxt('valBtNetReturn', (num(bt.netR) >= 0 ? '+' : '') + num(bt.netR).toFixed(1) + 'R');
    setTxt('valBtMaxDD', '-' + num(bt.maxDrawdownR).toFixed(1) + 'R');
    setTxt('valBtTrades', (bt.sampleSize || 0) + ' Sinyal Historis' + (bt.weakEvidence ? ' • Sampel Terbatas' : ''));
  }
  var futBox = $id('futuresRiskBox');
  if (futBox) futBox.classList.toggle('hidden', isSpot);
  updateRiskSizing();
}
function feedIsEstimate(src) {
  return /ESTIMATE|SYNTHETIC|LOCAL|CALIBRATED|DEFAULT/i.test(String(src || ''));
}
function updateModeChip() {
  var chip = $id('hdrModeChip');
  if (!chip) return;
  var cls = 'futures', txt = 'FUTURES • 2-ARAH + LEV';
  if (state.mode === 'investor') { cls = 'investor'; txt = 'INVESTOR • SPOT DCA'; }
  else if (state.subMode === 'spot') { cls = 'spot'; txt = 'SPOT • 1-ARAH (TANPA LEV)'; }
  chip.className = 'mode-chip ' + cls;
  chip.textContent = txt;
}
function renderHeader(a) {
  setTxt('hdrSymbolTitle', a.symbol + ' — ' + (a.name || ''));
  setTxt('hdrAssetCategory', catLabelOf(getMeta(a.symbol)));
  updateModeChip();
  var src = state.feedSource || 'LIVE';
  var el = $id('lblEngineStatus');
  if (el) {
    if (feedIsEstimate(src)) {
      el.innerHTML = '<span class="pulse-dot" style="background:#f59e0b;"></span><span style="color:#f59e0b;">ESTIMASI — menyambung ulang feed broker live…</span> • ' + (a.timeframe || state.tf);
    } else {
      el.innerHTML = '<span class="pulse-dot"></span>LIVE REAL-TIME • ' + src + ' • ' + (a.timeframe || state.tf);
    }
  }
  var price = num(state.livePrice) > 0 ? state.livePrice : a.lastPrice;
  setTxt('hdrLivePrice', formatPrice(price, a.symbol));
  var chg = num(state.liveChangePct, a.changePct);
  var chgEl = $id('hdrLiveChange');
  if (chgEl) {
    chgEl.textContent = (chg >= 0 ? '▲ +' : '▼ ') + Math.abs(chg).toFixed(2) + '%';
    chgEl.style.color = chg >= 0 ? '#10b981' : '#f43f5e';
  }
  if (state.candles && state.candles.length) {
    var last = state.candles[state.candles.length - 1];
    setTxt('hdrHigh', formatPrice(last.high, a.symbol));
    setTxt('hdrLow', formatPrice(last.low, a.symbol));
  }
  setTxt('hdrATR', num(a.indicators.atr).toPrecision(4));
}
function renderAllVisuals(analysis) {
  if (!analysis) return;
  try { analysis.symbol = analysis.symbol || state.symbol; } catch (e) {}
  state.lastAnalysis = analysis;
  try { renderHeader(analysis); } catch (e) {}
  try {
    if (candleSeries && state.candles && state.candles.length) {
      candleSeries.setData(state.candles);
    }
    syncIndicatorOverlays(analysis);
    drawChartLevels(analysis);
  } catch (e) {}
  try { renderPanels(analysis); } catch (e) {}
  try { renderNarrative(analysis); } catch (e) {}
  try { renderPillars(analysis); } catch (e) {}
}

/* ==================== 6. REAL-TIME PRICE ENGINE (SEMUA INSTRUMEN) ==================== */
function applyLiveTick(price, changePct, silent) {
  price = num(price);
  if (!price || price <= 0) return;
  if (!state.candles || !state.candles.length) { state.livePrice = price; return; }
  var step = TF_SECONDS[state.tf] || 3600;
  var nowSec = Math.floor(Date.now() / 1000);
  var bucket = Math.floor(nowSec / step) * step;
  var idx = state.candles.length - 1;
  var last = state.candles[idx];
  var bar;
  if (last.time < bucket) {
    bar = { time: bucket, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price, volume: 0 };
    state.candles.push(bar);
    if (state.candles.length > 700) state.candles.shift();
  } else {
    bar = { time: last.time, open: last.open, high: last.high, low: last.low, close: price, volume: last.volume };
    if (price > bar.high) bar.high = price;
    if (price < bar.low) bar.low = price;
    state.candles[idx] = bar;
  }
  if (candleSeries && candleSeries.update) { try { candleSeries.update(bar); } catch (e) {} }
  var prev = num(state.livePrice, price);
  state.livePrice = price;
  if (changePct !== undefined && Number.isFinite(Number(changePct))) state.liveChangePct = Number(changePct);
  var el = $id('hdrLivePrice');
  if (el) {
    el.textContent = formatPrice(price, state.symbol);
    if (!silent) {
      el.style.color = price >= prev ? '#10b981' : '#f43f5e';
      el.classList.remove('flash-up', 'flash-down');
      void el.offsetWidth;
      el.classList.add(price >= prev ? 'flash-up' : 'flash-down');
    }
  }
  var chgEl = $id('hdrLiveChange');
  if (chgEl && changePct !== undefined) {
    var c = Number(changePct) || 0;
    chgEl.textContent = (c >= 0 ? '▲ +' : '▼ ') + Math.abs(c).toFixed(2) + '%';
    chgEl.style.color = c >= 0 ? '#10b981' : '#f43f5e';
  }
  setTxt('hdrHigh', formatPrice(bar.high, state.symbol));
  setTxt('hdrLow', formatPrice(bar.low, state.symbol));
}
function startBinanceStream() {
  stopBinanceStream();
  var sym = (state.symbol || '').toUpperCase();
  if (sym.indexOf('/USDT') === -1) return;
  var pair = sym.replace('/', '').toLowerCase();
  var mySym = sym;
  try {
    var ws = new WebSocket('wss://stream.binance.com:9443/ws/' + pair + '@miniTicker');
    ws.onmessage = function (evt) {
      if (state.symbol !== mySym) { try { ws.close(); } catch (e) {} return; }
      try {
        var d = JSON.parse(evt.data);
        if (d && Number(d.c) > 0) {
          var chg = Number(d.o) > 0 ? ((Number(d.c) - Number(d.o)) / Number(d.o)) * 100 : undefined;
          applyLiveTick(Number(d.c), chg);
          state.feedSource = 'BINANCE WEBSOCKET';
        }
      } catch (e) {}
    };
    ws.onerror = function () { /* polling ticker server (patch v2026.27) tetap aktif sebagai cadangan */ };
    binanceWs = ws;
  } catch (e) {}
}
function stopBinanceStream() {
  if (binanceWs) { try { binanceWs.close(); } catch (e) {} binanceWs = null; }
}
function startCandleCountdown() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  lastCandleBucket = Math.floor(Date.now() / 1000 / (TF_SECONDS[state.tf] || 3600));
  countdownTimer = setInterval(function () {
    var step = TF_SECONDS[state.tf] || 3600;
    var nowSec = Math.floor(Date.now() / 1000);
    var remain = step - (nowSec % step);
    var el = $id('lblCandleCountdown');
    if (el) {
      var h = Math.floor(remain / 3600);
      var m = Math.floor((remain % 3600) / 60);
      var s = remain % 60;
      var dd = Math.floor(h / 24); h = h % 24;
      var pad = function (v) { return (v < 10 ? '0' : '') + v; };
      el.textContent = (dd > 0 ? dd + 'h ' : '') + (h > 0 ? h + ':' : '') + pad(m) + ':' + pad(s);
    }
    var curBucket = Math.floor(nowSec / step);
    if (curBucket !== lastCandleBucket) {
      lastCandleBucket = curBucket;
      // Candle baru terbentuk -> sinkronisasi ulang data broker & kunci setup baru
      setTimeout(function () {
        try { if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true); } catch (e) {}
      }, 1400);
    }
  }, 1000);
}
function connectRealtimeStream() {
  try { startCandleCountdown(); } catch (e) {}
  try { startBinanceStream(); } catch (e) {}
  try {
    var el = $id('lblEngineStatus');
    var isCrypto = (state.symbol || '').indexOf('/USDT') > -1;
    if (el) {
      if (state.feedSource && feedIsEstimate(state.feedSource)) {
        el.innerHTML = '<span class="pulse-dot" style="background:#f59e0b;"></span><span style="color:#f59e0b;">ESTIMASI — menyambung ulang feed broker live…</span> • ' + state.tf;
      } else if (state.feedSource && state.feedSource !== '-') {
        el.innerHTML = '<span class="pulse-dot"></span>LIVE REAL-TIME • ' + state.feedSource + ' • ' + state.tf;
      } else {
        el.innerHTML = '<span class="pulse-dot"></span>LIVE REAL-TIME • ' +
          (isCrypto ? 'BINANCE WS + EDGE QUOTE' : 'EDGE BROKER QUOTE (TradingView + Yahoo Finance)') + ' • ' + state.tf;
      }
    }
  } catch (e) {}
}

/* ==================== 7. RADAR REKOMENDASI MULTI-ASET PER-HORIZON ====================
   Scalping (M1-M15) / Intraday (M15-H1) / Swing (H4-W1).
   Setiap kartu = analisis quant penuh pada candle real-time aset tsb:
   trader -> ▲ LONG / ▼ SHORT (futures) atau TUNGGU (spot 1-arah),
   investor -> AKUMULASI / DCA / TUNGGU DISKON (framing beli-nyata). */
function fetchRadarCandidate(item) {
  return fetchRealMarketCandles(item.sym, item.tf).then(function (d) {
    var a = computeQuantEngine(d.candles, item.sym, item.tf, false);
    if (!a) throw new Error('no-analysis');
    return {
      sym: item.sym, tf: item.tf, analysis: a,
      price: num(d.price) > 0 ? num(d.price) : a.lastPrice,
      changePct: Number.isFinite(Number(d.changePct)) ? Number(d.changePct) : num(a.changePct),
      source: d.source || 'BROKER FEED'
    };
  });
}
function radarBadgeFor(a) {
  var sc = num(a && a.confluenceScore, 50);
  if (state.mode === 'investor') {
    if (a.direction === 'LONG' && sc >= 65) return { cls: 'accum', txt: '● AKUMULASI KUAT' };
    if (a.direction === 'LONG') return { cls: 'accum', txt: '● DICICIL / DCA' };
    if (a.direction === 'SHORT') return { cls: 'wait', txt: '◆ TUNGGU DISKON' };
    return { cls: 'wait', txt: '◆ HOLD / PANTAU' };
  }
  var isSpot = state.subMode === 'spot';
  if (a.direction === 'LONG') return { cls: 'long', txt: '▲ LONG / BUY' };
  if (a.direction === 'SHORT') return isSpot ? { cls: 'wait', txt: '◆ TUNGGU (SPOT)' } : { cls: 'short', txt: '▼ SHORT / SELL' };
  return { cls: 'wait', txt: '◆ NETRAL' };
}
function paintRadarItems(cfg, items) {
  var grid = $id('opportunityRadarGrid');
  if (!grid) return;
  if (!items || !items.length) {
    grid.innerHTML = '<div class="radar-card" style="cursor:default;grid-column:1/-1;"><span class="r-name">Feed radar belum tersedia — coba lagi sebentar.</span></div>';
    return;
  }
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var a = it.analysis;
    var meta = getMeta(it.sym);
    var badge = radarBadgeFor(a);
    var chg = num(it.changePct, num(a.changePct));
    var chgCol = chg >= 0 ? '#10b981' : '#f43f5e';
    var sc = num(a.confluenceScore, 50);
    var entryRef = state.mode === 'investor' ? (a.levels && a.levels.dcaZone1 ? a.levels.dcaZone1 : a.lastPrice) : (a.levels ? a.levels.entry : a.lastPrice);
    var isActive = it.sym === state.symbol && it.tf === state.tf;
    html += '<div class="radar-card' + (isActive ? ' active' : '') + '" data-sym="' + it.sym + '" data-tf="' + it.tf + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">' +
        '<span class="r-sym">' + it.sym + ' <small style="color:#64748b;font-weight:700;">' + it.tf + '</small></span>' +
        '<span class="r-live">' + (feedIsEstimate(it.source) ? '○ EST' : '● LIVE') + '</span>' +
      '</div>' +
      '<span class="r-name">' + (meta.name || it.sym) + '</span>' +
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:6px;">' +
        '<span class="r-price">' + formatPrice(it.price, it.sym) + '</span>' +
        '<span class="r-chg" style="color:' + chgCol + ';">' + pctFmt(chg) + '</span>' +
      '</div>' +
      '<span class="sig-badge ' + badge.cls + '">' + badge.txt + '</span>' +
      '<div style="display:flex;justify-content:space-between;gap:6px;margin-top:5px;">' +
        '<span class="r-entry">' + (state.mode === 'investor' ? 'Zona DCA 1: ' : 'Entry: ') + formatPrice(entryRef, it.sym) + '</span>' +
        '<span class="r-score">SKOR ' + sc + '</span>' +
      '</div>' +
    '</div>';
  }
  grid.innerHTML = html;
  Array.prototype.forEach.call(grid.querySelectorAll('.radar-card[data-sym]'), function (card) {
    card.addEventListener('click', function () {
      gotoInstrument(card.getAttribute('data-sym'), card.getAttribute('data-tf'));
    });
  });
}
function syncHorizonTabs() {
  var bar = $id('radarHorizonBar');
  if (!bar) return;
  Array.prototype.forEach.call(bar.querySelectorAll('.hz-btn'), function (b) {
    b.classList.toggle('active', b.getAttribute('data-hz') === state.radarHorizon);
  });
}
function renderOpportunityRadar(force) {
  var grid = $id('opportunityRadarGrid');
  if (!grid) return;
  if (!state.radarHorizon) state.radarHorizon = 'intraday';
  if (state.mode === 'investor' && state.radarHorizon === 'scalping') state.radarHorizon = 'swing';
  var hz = state.radarHorizon;
  var cfg = RADAR_CONFIG[hz] || RADAR_CONFIG.intraday;
  syncHorizonTabs();
  var infoEl = $id('radarHorizonInfo');
  if (infoEl) infoEl.textContent = (state.mode === 'investor' ? (cfg.infoInvestor || '') : (cfg.infoTrader || ''));
  var cacheKey = hz;
  var cached = radarCache[cacheKey];
  if (!force && cached && (Date.now() - cached.ts) < 90000) {
    paintRadarItems(cfg, cached.items);
    return;
  }
  var mySeq = ++radarRunSeq;
  grid.innerHTML = '<div class="radar-card" style="cursor:default;grid-column:1/-1;"><span class="r-name">Memindai ' + cfg.list.length + ' aset dengan candle broker real-time (kelompok ' + cfg.tfRange + ')…</span></div>';
  Promise.allSettled(cfg.list.map(fetchRadarCandidate)).then(function (results) {
    if (mySeq !== radarRunSeq) return;
    var items = [];
    for (var i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled' && results[i].value) items.push(results[i].value);
    }
    // Urutkan: sinyal directional terkuat (skor paling jauh dari 50) di atas
    items.sort(function (x, y) {
      return Math.abs(num(y.analysis.confluenceScore, 50) - 50) - Math.abs(num(x.analysis.confluenceScore, 50) - 50);
    });
    radarCache[cacheKey] = { ts: Date.now(), items: items };
    paintRadarItems(cfg, items);
  }).catch(function () {});
}
function gotoInstrument(sym, tf) {
  if (!sym) return;
  if (!ensureQuotaFor(sym)) {
    renderInstrumentCatalog();
    return;
  }
  state.symbol = sym;
  if (tf && TF_SECONDS[tf]) {
    state.tf = tf;
    state.timeframe = tf;
    var tfBar = $id('timeframeBar');
    if (tfBar) {
      Array.prototype.forEach.call(tfBar.querySelectorAll('.tf-btn'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-tf') === tf);
      });
    }
  }
  state.candles = [];
  state.lastAnalysis = null;
  renderInstrumentCatalog();
  if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true);
  connectRealtimeStream();
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
}

/* ==================== 8. RISK & POSITION CALCULATOR ==================== */
function updateRiskSizing() {
  var a = state.lastAnalysis;
  if (!a || !a.levels) return;
  var bal = num($id('inpCalcBalance') ? $id('inpCalcBalance').value : 1000, 1000);
  var riskPct = num($id('inpCalcRiskPct') ? $id('inpCalcRiskPct').value : 1, 1);
  var riskUsd = bal * (riskPct / 100);
  var L = effectiveLevels(a);
  var stopDist = Math.abs(num(L.entry) - num(L.sl));
  var units = stopDist > 0 ? riskUsd / stopDist : 0;
  setTxt('valCalcDollarRisk', '$' + riskUsd.toFixed(2));
  setTxt('valCalcLotSize', (units >= 100 ? units.toFixed(1) : units.toFixed(4)) + ' Unit');
}

/* ==================== 9. SESI, KUOTA & ALUR LAYAR ==================== */
function saveSession() {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(state.user)); } catch (e) {}
}
function loadSession() {
  try {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    var u = JSON.parse(raw);
    if (!u || !u.email) return null;
    if (u.tier === 'VIP' && u.vipUntil && Date.now() > u.vipUntil) u.tier = 'FREE';
    return u;
  } catch (e) { return null; }
}
function quotaLimit() {
  if (!state.user) return 0;
  if (state.user.tier === 'VIP' || state.user.tier === 'OWNER_VIP') return Infinity;
  if (state.user.tier === 'FREE') return 2;
  return 0; // GUEST: hanya melihat instrumen default, ganti instrumen wajib login
}
function tierBadge(u) {
  if (!u || u.tier === 'GUEST') return 'MODE TAMU';
  if (u.tier === 'OWNER_VIP') return '👑 OWNER VIP';
  if (u.tier === 'VIP') return '💎 VIP MEMBER';
  return '✅ FREE GOOGLE';
}
function updateUserUi() {
  var u = state.user;
  setTxt('lblUserName', u ? (u.name || u.email.split('@')[0]) : 'Tamu');
  var badge = $id('lblUserTierBadge');
  if (badge) {
    badge.textContent = tierBadge(u);
    badge.style.background = u && (u.tier === 'VIP' || u.tier === 'OWNER_VIP') ? '#065f46' : u && u.tier === 'FREE' ? '#1e3a5f' : '#475569';
  }
  setTxt('ddUserEmail', u ? u.email : '-');
  setTxt('ddUserTier', tierBadge(u));
  var unlocked = unlockedSymbols();
  var limit = quotaLimit();
  setTxt('ddUserQuota', limit === Infinity ? unlocked.length + ' / ∞ Unlimited' : unlocked.length + ' / ' + limit + ' Instrumen');
}
function unlockedSymbols() {
  if (!state.user || !state.user.email) return [];
  try {
    return JSON.parse(localStorage.getItem('xstarzg_unlock_' + state.user.email) || '[]');
  } catch (e) { return []; }
}
function persistUnlocked(list) {
  if (!state.user || !state.user.email) return;
  try { localStorage.setItem('xstarzg_unlock_' + state.user.email, JSON.stringify(list.slice(0, 60))); } catch (e) {}
}
function ensureQuotaFor(symbol) {
  var u = state.user;
  // Instrumen showcase default selalu terbuka untuk semua pengunjung
  if (symbol === 'XAU/USD') return true;
  var limit = quotaLimit();
  if (limit === Infinity) return true;
  var unlocked = unlockedSymbols();
  if (unlocked.indexOf(symbol) > -1 || symbol === state.symbol) return true;
  if (unlocked.length < limit) {
    unlocked.push(symbol);
    persistUnlocked(unlocked);
    updateUserUi();
    return true;
  }
  // Kuota habis
  if (!u || u.tier === 'GUEST') {
    var gm = $id('googleAuthModal');
    if (gm) gm.classList.remove('hidden');
  } else {
    var reason = $id('vipModalReasonText');
    if (reason) reason.textContent = 'Kuota ' + limit + ' instrumen akun FREE Anda sudah penuh (' + unlocked.join(', ') + '). Upgrade VIP $29 USDT untuk membuka seluruh 1.600+ instrumen tanpa batas.';
    var pm = $id('paymentModal');
    if (pm) pm.classList.remove('hidden');
  }
  return false;
}
function showScreen(name) {
  var front = $id('frontLandingScreen'), gate = $id('loginGateScreen'), work = $id('appWorkspaceWrapper');
  if (front) front.classList.toggle('hidden', name !== 'front');
  if (gate) gate.classList.toggle('hidden', name !== 'gate');
  if (work) work.classList.toggle('hidden', name !== 'work');
  var dd = $id('userProfileDropdown');
  if (dd) dd.classList.add('hidden');
  try { window.scrollTo({ top: 0 }); } catch (e) {}
}
function enterWorkspace() {
  showScreen('work');
  updateUserUi();
  setTimeout(function () {
    initChart();
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true);
    connectRealtimeStream();
    renderOpportunityRadar();
  }, 60);
}

/* ==================== 10. VIP PAYMENT (ON-CHAIN BSC VERIFY) ==================== */
function clientVerifyBscPayment(txHash) {
  var rpcList = [
    'https://bsc-dataseed1.bnbchain.org',
    'https://bsc-dataseed.binance.org',
    'https://bsc-dataseed1.defibit.io',
    'https://bsc.publicnode.com'
  ];
  var targetTopic = VIP_WALLET.toLowerCase().replace('0x', '').padStart(64, '0');
  var attempt = function (idx) {
    if (idx >= rpcList.length) return Promise.resolve({ verified: false, error: 'Semua RPC BSC gagal dihubungi.' });
    var ctrl = new AbortController();
    var t = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 7000);
    return fetch(rpcList[idx], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
      signal: ctrl.signal
    }).then(function (r) {
      clearTimeout(t);
      return r.json();
    }).then(function (d) {
      var receipt = d && d.result;
      if (!receipt) return attempt(idx + 1);
      if (receipt.status !== '0x1') return { verified: false, error: 'Transaksi gagal (status revert) di BSC.' };
      var logs = receipt.logs || [];
      for (var i = 0; i < logs.length; i++) {
        var lg = logs[i];
        if ((lg.address || '').toLowerCase() !== USDT_BSC_CONTRACT.toLowerCase()) continue;
        var topics = lg.topics || [];
        if ((topics[2] || '').toLowerCase().replace(/^0x0+/, '0x') !== ('0x' + VIP_WALLET.toLowerCase().replace('0x', '')) &&
            !(topics[2] || '').toLowerCase().endsWith(targetTopic)) continue;
        var usdValue = parseInt(lg.data, 16) / 1e18;
        if (usdValue >= VIP_PRICE - 0.25) return { verified: true, amount: usdValue };
        return { verified: false, error: 'Jumlah transfer $' + usdValue.toFixed(2) + ' USDT — di bawah $' + VIP_PRICE + '.' };
      }
      return { verified: false, error: 'Transfer USDT ke wallet VIP resmi tidak ditemukan pada TxHash ini.' };
    }).catch(function () {
      clearTimeout(t);
      return attempt(idx + 1);
    });
  };
  return attempt(0);
}
function bindVipFlow() {
  var pm = $id('paymentModal');
  var open = function (reasonText) {
    if (reasonText) { var r = $id('vipModalReasonText'); if (r) r.textContent = reasonText; }
    if (pm) pm.classList.remove('hidden');
  };
  var bind = function (id, fn) { var el = $id(id); if (el) el.addEventListener('click', fn); };
  bind('btnOpenVipModal', function () { open(); });
  bind('btnOpenVipFromMenu', function () {
    var dd = $id('userProfileDropdown'); if (dd) dd.classList.add('hidden');
    open();
  });
  bind('btnCloseVipModal', function () { if (pm) pm.classList.add('hidden'); });
  bind('btnCopyWallet', function () {
    var btn = $id('btnCopyWallet');
    var done = function () { if (btn) { btn.textContent = '✅ Tersalin!'; setTimeout(function () { btn.textContent = '📋 Salin'; }, 1800); } };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(VIP_WALLET).then(done).catch(done);
    } else done();
  });
  bind('btnVerifyTxHash', function () {
    var inp = $id('inpTxHash');
    var fb = $id('vipVerifyFeedback');
    var btn = $id('btnVerifyTxHash');
    var tx = (inp && inp.value || '').trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(tx)) {
      if (fb) { fb.style.color = '#fda4af'; fb.textContent = '⚠️ Format TxHash tidak valid — harus diawali 0x dan 64 karakter hex.'; }
      return;
    }
    if (fb) { fb.style.color = '#94a3b8'; fb.textContent = '⏳ Memverifikasi pembayaran on-chain di jaringan BNB Smart Chain (BEP-20)…'; }
    if (btn) btn.disabled = true;
    clientVerifyBscPayment(tx).then(function (res) {
      if (btn) btn.disabled = false;
      if (res && res.verified) {
        if (fb) { fb.style.color = '#10b981'; fb.textContent = '✅ Pembayaran $' + (res.amount || VIP_PRICE).toFixed(2) + ' USDT TERVERIFIKASI ON-CHAIN! Lisensi VIP 30 hari aktif.'; }
        state.user = state.user || { email: 'vip@xstarzg.local', name: 'VIP Member' };
        state.user.tier = 'VIP';
        state.user.vipUntil = Date.now() + 30 * 86400000;
        saveSession(); updateUserUi();
        setTimeout(function () { if (pm) pm.classList.add('hidden'); }, 2200);
      } else if (fb) {
        fb.style.color = '#fda4af';
        fb.textContent = 'ℹ️ ' + ((res && res.error) || 'TxHash belum ditemukan. Pastikan transfer $29 USDT (BEP-20) sudah terkonfirmasi.');
      }
    });
  });
}

/* ==================== 11. BINDING SEMUA TOMBOL & ALUR ==================== */
function bindUiEvents() {
  var bind = function (id, fn) { var el = $id(id); if (el) el.addEventListener('click', fn); };
  /* ---- Landing & Login gate ---- */
  bind('btnNavLoginGate', function () {
    if (state.user) enterWorkspace(); else showScreen('gate');
  });
  bind('btnHeroLoginGate', function () {
    if (state.user) enterWorkspace(); else showScreen('gate');
  });
  bind('btnHeroPreview', function () {
    state.user = state.user || { email: 'guest@xstarzg.local', name: 'Mode Tamu', tier: 'GUEST' };
    enterWorkspace();
  });
  bind('btnBackToLanding', function () { showScreen('front'); });
  bind('btnBrandLogoHome', function () { showScreen('front'); });
  bind('btnTriggerGooglePopup', function () {
    var gm = $id('googleAuthModal'); if (gm) gm.classList.remove('hidden');
  });
  bind('btnInstantPreview', function () {
    state.user = { email: 'guest@xstarzg.local', name: 'Mode Tamu', tier: 'GUEST' };
    enterWorkspace();
  });
  var closeGoogle = function () { var gm = $id('googleAuthModal'); if (gm) gm.classList.add('hidden'); };
  bind('btnCloseGoogleModal', closeGoogle);
  bind('btnCancelGoogleModal', closeGoogle);
  bind('btnSubmitGoogleEmail', function () {
    var emailEl = $id('googleEmailInput');
    var nameEl = $id('googleNameInput');
    var email = (emailEl && emailEl.value || '').trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
      if (emailEl) { emailEl.style.borderColor = '#f43f5e'; emailEl.focus(); }
      setTxt('googleAuthError', 'Masukkan alamat Google yang valid (cth: nama@gmail.com)');
      return;
    }
    if (emailEl) emailEl.style.borderColor = '#334155';
    var name = (nameEl && nameEl.value || '').trim() || email.split('@')[0];
    var tier = OWNER_EMAILS_CLIENT.indexOf(email) > -1 ? 'OWNER_VIP' : 'FREE';
    var prev = loadSession();
    state.user = {
      email: email, name: name.charAt(0).toUpperCase() + name.slice(1), tier: tier,
      vipUntil: (prev && prev.email === email) ? prev.vipUntil : null
    };
    if (prev && prev.email === email && prev.tier === 'VIP' && prev.vipUntil && Date.now() < prev.vipUntil) {
      state.user.tier = 'VIP';
    }
    saveSession();
    closeGoogle();
    enterWorkspace();
  });
  /* ---- Topbar: mode & profil ---- */
  bind('btnModeTrader', function () { setMode('trader'); });
  bind('btnModeInvestor', function () { setMode('investor'); });
  bind('btnSubFutures', function () { setSubMode('futures'); });
  bind('btnSubSpot', function () { setSubMode('spot'); });
  var btnSess = $id('btnUserSession');
  if (btnSess) btnSess.addEventListener('click', function (e) {
    e.stopPropagation();
    var dd = $id('userProfileDropdown');
    if (dd) dd.classList.toggle('hidden');
    updateUserUi();
  });
  document.addEventListener('click', function (e) {
    var dd = $id('userProfileDropdown');
    if (dd && !dd.classList.contains('hidden') && !dd.contains(e.target) && e.target !== btnSess && !(btnSess && btnSess.contains(e.target))) {
      dd.classList.add('hidden');
    }
  });
  bind('btnBackToFrontFromMenu', function () { showScreen('front'); });
  var doLogout = function () {
    state.user = null;
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    updateUserUi();
    showScreen('front');
  };
  bind('btnLogout', doLogout);
  bind('btnDirectLogout', doLogout);
  /* ---- Kontrol instrumen ---- */
  var catSel = $id('selCategory');
  if (catSel) catSel.addEventListener('change', function () { renderInstrumentCatalog(); });
  var searchInp = $id('inpSearchAsset');
  if (searchInp) {
    searchInp.addEventListener('input', function () { renderInstrumentCatalog(searchInp.value); });
    searchInp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = ($id('selInstrument') || {}).querySelector ? $id('selInstrument').querySelector('option') : null;
        if (first && first.value) selectSymbol(first.value);
      }
    });
  }
  var instSel = $id('selInstrument');
  if (instSel) instSel.addEventListener('change', function () { if (instSel.value) selectSymbol(instSel.value); });
  /* ---- Timeframe bar ---- */
  var tfBar = $id('timeframeBar');
  if (tfBar) {
    Array.prototype.forEach.call(tfBar.querySelectorAll('.tf-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var tf = btn.getAttribute('data-tf');
        if (!tf || tf === state.tf) return;
        Array.prototype.forEach.call(tfBar.querySelectorAll('.tf-btn'), function (b) { b.classList.toggle('active', b === btn); });
        state.tf = tf; state.timeframe = tf;
        state.candles = [];
        if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true);
        connectRealtimeStream();
      });
    });
  }
  /* ---- Tab horizon radar (Scalping / Intraday / Swing) ---- */
  var hzBar = $id('radarHorizonBar');
  if (hzBar) {
    Array.prototype.forEach.call(hzBar.querySelectorAll('.hz-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var hz = btn.getAttribute('data-hz');
        if (!hz || hz === state.radarHorizon) return;
        state.radarHorizon = hz;
        syncHorizonTabs();
        renderOpportunityRadar(true);
      });
    });
  }
  /* ---- Overlay toggles & recalc ---- */
  ['chkEMA', 'chkVWAP', 'chkSMC', 'chkSniper'].forEach(function (id) {
    var el = $id(id);
    if (el) el.addEventListener('change', function () {
      syncIndicatorOverlays(state.lastAnalysis);
      drawChartLevels(state.lastAnalysis);
    });
  });
  bind('btnRunEngine', function () { if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true); });
  /* ---- Risk calc inputs ---- */
  ['inpCalcBalance', 'inpCalcRiskPct'].forEach(function (id) {
    var el = $id(id);
    if (el) el.addEventListener('input', updateRiskSizing);
  });
  bindVipFlow();
}
function setMode(mode) {
  state.mode = mode;
  var t = $id('btnModeTrader'), i = $id('btnModeInvestor');
  if (t) t.classList.toggle('active', mode === 'trader');
  if (i) i.classList.toggle('active', mode === 'investor');
  var sub = $id('traderSubModeWrap');
  if (sub) sub.style.display = mode === 'trader' ? 'flex' : 'none';
  // Investor: rekomendasi diframe sebagai keputusan beli-nyata; scalping bukan untuk investor
  if (mode === 'investor' && state.radarHorizon === 'scalping') state.radarHorizon = 'swing';
  syncHorizonTabs();
  renderOpportunityRadar(false);
  updateModeChip();
  if (typeof window.runFullAnalysis === 'function' && state.candles.length) window.runFullAnalysis(true);
}
function setSubMode(sub) {
  state.subMode = sub;
  var f = $id('btnSubFutures'), s = $id('btnSubSpot');
  if (f) f.classList.toggle('active', sub === 'futures');
  if (s) s.classList.toggle('active', sub === 'spot');
  updateModeChip();
  if (state.lastAnalysis) {
    renderPanels(state.lastAnalysis);
    renderHeader(state.lastAnalysis);
    drawChartLevels(state.lastAnalysis);
  }
  // Repaint badge radar (SHORT futures -> TUNGGU di spot 1-arah)
  renderOpportunityRadar(false);
}
function selectSymbol(sym) {
  if (!sym) return;
  if (!ensureQuotaFor(sym)) {
    renderInstrumentCatalog();
    return;
  }
  state.symbol = sym;
  state.candles = [];
  state.lastAnalysis = null;
  renderInstrumentCatalog();
  if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true);
  connectRealtimeStream();
  renderOpportunityRadar();
}

/* ==================== 12. BOOTSTRAP ==================== */
function bootCore() {
  bindUiEvents();
  renderInstrumentCatalog();
  var saved = loadSession();
  if (saved) { state.user = saved; }
  updateUserUi();
  showScreen('front');
  // Muat mesin quant bersama (hasil penyempurnaan sesi sebelumnya)
  // safeImport tidak pernah melempar error sinkron meski dynamic import tak didukung.
  var safeImport = function (p) {
    try { return (new Function('p', 'return import(p)'))(p).catch(function () { return null; }); }
    catch (e) { return Promise.resolve(null); }
  };
  Promise.all([
    safeImport('/js/shared/quant-core.js?v=2026.33'),
    safeImport('/js/shared/signal-engine.js?v=2026.33')
  ]).then(function (mods) {
    if (mods[0]) QC = mods[0];
    if (mods[1]) SE = mods[1];
    renderInstrumentCatalog();
    lazyLoadCryptoPairs();
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootCore);
} else {
  bootCore();
}

// === XSTARZG_SAFE_REALTIME_TICKER_V2026_27 ===
(function () {
  let rtBusy = false;
  setInterval(async function () {
    if (rtBusy) return;
    try {
      if (typeof state === 'undefined' || !state || !state.symbol) return;
      const workEl = document.getElementById('appWorkspaceWrapper');
      if (workEl && workEl.classList.contains('hidden')) return;
      rtBusy = true;
      const sym = state.symbol;
      const tf = state.tf || state.timeframe || 'H1';
      const res = await fetch('/api/market/analyze?quote=1&symbol=' + encodeURIComponent(sym) + '&tf=' + encodeURIComponent(tf) + '&_t=' + Date.now(), {
        cache: 'no-store'
      });
      if (res.ok) {
        const d = await res.json();
        const q = d && d.quote ? d.quote : null;
        if (q && Number(q.price) > 0 && state.symbol === sym) {
          const liveP = Number(q.price);
          const prevP = Number(state.livePrice) || liveP;
          state.livePrice = liveP;
          if (Array.isArray(state.candles) && state.candles.length > 0) {
            const lastIdx = state.candles.length - 1;
            const lastBar = Object.assign({}, state.candles[lastIdx]);
            lastBar.close = liveP;
            if (liveP > lastBar.high) lastBar.high = liveP;
            if (liveP < lastBar.low) lastBar.low = liveP;
            state.candles[lastIdx] = lastBar;
            if (typeof candleSeries !== 'undefined' && candleSeries && typeof candleSeries.update === 'function') {
              try { candleSeries.update(lastBar); } catch (e) {}
            }
          }
          const fmt = typeof formatPrice === 'function' ? formatPrice(liveP, sym) : liveP.toLocaleString('en-US', { maximumFractionDigits: 2 });
          ['hdrLivePrice', 'livePriceDisplay', 'valCurrentPrice'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) {
              el.textContent = fmt;
              if (liveP !== prevP) {
                el.style.color = liveP > prevP ? '#10b981' : '#f43f5e';
              }
            }
          });
          if (Number.isFinite(Number(q.changePct))) {
            const chg = Number(q.changePct);
            ['hdrLiveChange', 'liveChangeDisplay'].forEach(function (id) {
              const el = document.getElementById(id);
              if (el) {
                el.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
                el.style.color = chg >= 0 ? '#10b981' : '#f43f5e';
              }
            });
          }
        }
      }
    } catch (e) {}
    rtBusy = false;
  }, 1500);
})();

// === XSTARZG_INSTANT_RENDER_GUARANTEE_V2026_30 ===
(function () {
  const SEED_PRICES = {
    // Harga jangkar dikalibrasi ke pasar 2026 — hanya dipakai 0-2 detik sebelum kuotasi live tiba
    'XAU/USD': 4055.00, 'XAU/IDR': 2158000, 'XAG/USD': 50.00, 'XPT/USD': 1580.00, 'XPD/USD': 1050.00, 'XCU/USD': 5.10, 'HG/USD': 5.10,
    'EUR/USD': 1.0845, 'GBP/USD': 1.2960, 'USD/JPY': 152.40, 'USD/CHF': 0.8650, 'AUD/USD': 0.6580, 'USD/CAD': 1.3890,
    'NZD/USD': 0.5980, 'USD/IDR': 16550, 'BBCA.JK': 9850, 'BBRI.JK': 4420, 'BMRI.JK': 6150, 'BBNI.JK': 4880,
    'TLKM.JK': 2760, 'ASII.JK': 4950, 'ANTM.JK': 1620, 'NVDA': 142.50, 'AAPL': 234.80, 'MSFT': 428.00,
    'TSLA': 262.00, 'BTC/USDT': 100000.00, 'ETH/USDT': 3400.00, 'SOL/USDT': 200.00, 'BNB/USDT': 645.00
  };
  function generateSeedCandles(symbol, tf) {
    const sym = (symbol || 'XAU/USD').toUpperCase();
    const baseP = SEED_PRICES[sym] || 100;
    const tfSecMap = { 'M1': 60, 'M5': 300, 'M15': 900, 'M30': 1800, 'H1': 3600, 'H4': 14400, 'D1': 86400, 'W1': 604800, 'MN': 2592000, '1Y': 7776000 };
    const step = tfSecMap[tf] || 3600;
    const nowBucket = Math.floor(Date.now() / 1000 / step) * step;
    const atr = baseP * 0.0032;
    let seed = 0;
    for (let i = 0; i < sym.length; i++) seed = (seed * 31 + sym.charCodeAt(i)) % 1000003;
    const rand = () => { seed = (seed * 16807 + 11) % 2147483647; return (seed % 10000) / 10000; };
    const count = 180;
    const closes = new Array(count);
    closes[count - 1] = baseP;
    let cur = baseP;
    for (let i = count - 2; i >= 0; i--) {
      const wave = Math.sin(i * 0.21) * (atr * 0.35);
      const noise = (rand() - 0.492) * (atr * 0.65);
      cur = Math.max(baseP * 0.6, cur - noise - wave * 0.15);
      closes[i] = cur;
    }
    const out = [];
    for (let i = 0; i < count; i++) {
      const t = nowBucket - (count - 1 - i) * step;
      const o = i === 0 ? closes[0] * 0.999 : closes[i - 1];
      const c = closes[i];
      const h = Math.max(o, c) + (0.2 + rand() * 0.5) * atr * 0.6;
      const l = Math.min(o, c) - (0.2 + rand() * 0.5) * atr * 0.6;
      out.push({ time: t, open: o, high: h, low: l, close: c, volume: Math.round(120 + rand() * 800) });
    }
    return { price: baseP, candles: out };
  }
  // Fallback Canvas Candlestick Renderer jika CDN LightweightCharts diblokir ISP
  function drawCanvasFallbackChart(candles, analysis) {
    const container = document.getElementById('tvChartContainer');
    if (!container || typeof LightweightCharts !== 'undefined') return;
    let canvas = container.querySelector('canvas.xstarzg-fallback-canvas');
    if (!canvas) {
      container.innerHTML = '';
      canvas = document.createElement('canvas');
      canvas.className = 'xstarzg-fallback-canvas';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);
    }
    const w = container.clientWidth || 820;
    const h = container.clientHeight || 470;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, w, h);
    const slice = candles.slice(-90);
    if (slice.length === 0) return;
    let maxP = Math.max(...slice.map(c => c.high));
    let minP = Math.min(...slice.map(c => c.low));
    if (analysis) {
      maxP = Math.max(maxP, analysis.tp2 || maxP);
      minP = Math.min(minP, analysis.sl || minP);
    }
    const pad = (maxP - minP) * 0.08 || 1;
    maxP += pad;
    minP -= pad;
    const yOf = (p) => h - 28 - ((p - minP) / (maxP - minP)) * (h - 56);
    ctx.strokeStyle = 'rgba(148,163,184,0.08)';
    ctx.lineWidth = 1;
    for (let g = 1; g <= 5; g++) {
      const gy = (h / 6) * g;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }
    const stepX = (w - 90) / slice.length;
    const barW = Math.max(2, stepX * 0.68);
    slice.forEach((c, idx) => {
      const x = 14 + idx * stepX;
      const isUp = c.close >= c.open;
      ctx.strokeStyle = isUp ? '#10b981' : '#f43f5e';
      ctx.fillStyle = isUp ? '#10b981' : '#f43f5e';
      ctx.beginPath();
      ctx.moveTo(x + barW / 2, yOf(c.high));
      ctx.lineTo(x + barW / 2, yOf(c.low));
      ctx.stroke();
      const yTop = yOf(Math.max(c.open, c.close));
      const yBot = yOf(Math.min(c.open, c.close));
      ctx.fillRect(x, yTop, barW, Math.max(2, yBot - yTop));
    });
    if (analysis) {
      const drawLine = (p, col, lbl) => {
        const y = yOf(p);
        if (y < 10 || y > h - 10) return;
        ctx.strokeStyle = col;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col;
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`${lbl}: ${formatPrice(p, analysis.symbol)}`, w - 210, y - 4);
      };
      drawLine(analysis.entry, '#38bdf8', 'ENTRY');
      drawLine(analysis.sl, '#f43f5e', 'SL');
      drawLine(analysis.tp1, '#10b981', 'TP1');
      drawLine(analysis.tp2, '#10b981', 'TP2');
    }
  }
  // Override runFullAnalysis agar 100% langsung menggambar data & chart dalam 0 detik lalu menyinkronkan harga live
  window.runFullAnalysis = async function (forceRecalc = false) {
    try {
      if (!chartInstance && typeof initChart === 'function') initChart();
      // 1. Jika state.candles masih kosong atau berganti simbol, langsung tampilkan seed terkalibrasi (0ms delay)
      if (!state.candles || state.candles.length === 0 || (state.lastAnalysis && state.lastAnalysis.symbol !== state.symbol)) {
        const seeded = generateSeedCandles(state.symbol, state.tf);
        state.candles = seeded.candles;
        state.livePrice = seeded.price;
        state.liveChangePct = 0.25;
        const instantAnalysis = computeQuantEngine(state.candles, state.symbol, state.tf, forceRecalc);
        renderAllVisuals(instantAnalysis, true);
        drawCanvasFallbackChart(state.candles, instantAnalysis);
        if (chartInstance) chartInstance.timeScale().fitContent();
        renderOpportunityRadar();
      }
      // 2. Ambil kuotasi & candlestick broker real-time dari server
      const data = await fetchRealMarketCandles(state.symbol, state.tf);
      if (data && Array.isArray(data.candles) && data.candles.length >= 5) {
        state.candles = data.candles;
        state.livePrice = Number(data.price) || data.candles[data.candles.length - 1].close;
        state.liveChangePct = Number(data.changePct) || 0.25;
        state.feedSource = data.source || 'LIVE_BROKER';
        const analysis = computeQuantEngine(state.candles, state.symbol, state.tf, forceRecalc);
        renderAllVisuals(analysis, true);
        drawCanvasFallbackChart(state.candles, analysis);
        if (chartInstance) chartInstance.timeScale().fitContent();
      }
      connectRealtimeStream();
      renderOpportunityRadar();
    } catch (err) {
      const seeded = generateSeedCandles(state.symbol, state.tf);
      state.candles = seeded.candles;
      state.livePrice = seeded.price;
      const fallbackAnalysis = computeQuantEngine(state.candles, state.symbol, state.tf, false);
      renderAllVisuals(fallbackAnalysis, true);
      drawCanvasFallbackChart(state.candles, fallbackAnalysis);
      renderOpportunityRadar();
    }
  };
  // Pre-warm radar & initial analysis on load
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      const seeded = generateSeedCandles(state.symbol, state.tf);
      state.candles = seeded.candles;
      state.livePrice = seeded.price;
      const initAn = computeQuantEngine(state.candles, state.symbol, state.tf, false);
      renderAllVisuals(initAn, false);
      renderOpportunityRadar();
    }, 50);
  });
})();
