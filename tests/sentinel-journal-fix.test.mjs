// tests/sentinel-journal-fix.test.mjs
// Verifikasi perbaikan Bug 04:45 AM Sentinel (SL+ prematur), Journal hilang, dan fakeout levels

import assert from 'node:assert';
import { processInstrumentAnalysis, formatP, syncActiveLocksFromCloud } from '../scripts/market-sentinel.mjs';
import * as SE from '../public/js/shared/signal-engine.js';
import { onRequestGet, onRequestPost, onRequestOptions } from '../functions/api/market/journal-sync.js';

let passed = 0;
let failed = 0;

function chk(name, condition) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}`);
    failed++;
  }
}

async function asyncChk(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}\n`, err);
    failed++;
  }
}

console.log('=== RUNNING SENTINEL & JOURNAL GLITCH REGRESSION TESTS ===\n');

// 1. Sentinel: Mencegah Notifikasi SL+ di Detik yang Sama dengan Sinyal (Kasus 04:45 AM)
await asyncChk('Sentinel tidak boleh mengirim SL+ pada cycle penerbitan sinyal (04:45 AM bug)', async () => {
  const sentMessages = [];
  const mockSend = async (msg) => { sentMessages.push(msg); };
  const cache = { notified: {}, slPlusLocks: {} };

  const inst = { sym: 'XAU/USD', tf: 'H1', type: 'commodity', hz: 'intraday' };
  const candles = [
    { time: 1000, open: 2650, high: 2655, low: 2648, close: 2652, volume: 100 },
    { time: 2000, open: 2652, high: 2658, low: 2650, close: 2655, volume: 120 }
  ];
  while (candles.length < 50) {
    candles.unshift({ time: 500 - candles.length * 10, open: 2640, high: 2645, low: 2638, close: 2642, volume: 80 });
  }

  // Setup sinyal LONG skor tinggi
  const mockAnalysis = {
    direction: 'LONG',
    confluenceScore: 88,
    signalEligible: true,
    signalTier: 'ELITE',
    atr: 5.0,
    regime: 'Bullish Institutional Flow',
    anchorClosedTime: 1000,
    levels: {
      entry: 2650.0, // Limit buy di bawah harga live 2655
      sl: 2640.0,
      tp1: 2670.0,
      tp2: 2685.0,
      tp3: 2700.0
    }
  };

  // Run cycle 1: Sinyal baru ditemukan
  await processInstrumentAnalysis({
    inst,
    candles,
    a: mockAnalysis,
    cache,
    sendFn: mockSend,
    minScore: 75
  });

  // Verifikasi hanya 1 pesan (Sinyal Entry), BUKAN 2 pesan (Sinyal + SL+)
  chk('Hanya 1 pesan terkirim pada cycle awal (sinyal entry baru)', sentMessages.length === 1);
  chk('Pesan memuat instruksi eksekusi BUY LIMIT', sentMessages[0].includes('BUY LIMIT') && sentMessages[0].includes('2650.00'));
  chk('Lock terdaftar dengan status PENDING_FILL', cache.slPlusLocks['XAU/USD'].status === 'PENDING_FILL');
  chk('Order belum berstatus filled', cache.slPlusLocks['XAU/USD'].filled === false);
  chk('SL+ belum terpicu', cache.slPlusLocks['XAU/USD'].notifiedSlPlus === false);

  // Run cycle 2: Harga live masih 2655, low candle belum menjemput entry 2650 (low: 2652)
  const candlesNotFilled = [...candles];
  candlesNotFilled[candlesNotFilled.length - 1] = { time: 3000, open: 2655, high: 2657, low: 2652, close: 2654, volume: 100 };

  await processInstrumentAnalysis({
    inst,
    candles: candlesNotFilled,
    a: mockAnalysis,
    cache,
    sendFn: mockSend,
    minScore: 75
  });

  chk('Pesan SL+ TIDAK terkirim karena limit order belum terjemput (low > entry)', sentMessages.length === 1);
  chk('Order tetap PENDING_FILL', cache.slPlusLocks['XAU/USD'].status === 'PENDING_FILL');

  // Run cycle 3: Harga turun menjemput entry (low: 2649.50 <= entry 2650)
  const candlesFilled = [...candles];
  candlesFilled[candlesFilled.length - 1] = { time: 4000, open: 2654, high: 2655, low: 2649.5, close: 2651, volume: 150 };

  await processInstrumentAnalysis({
    inst,
    candles: candlesFilled,
    a: mockAnalysis,
    cache,
    sendFn: mockSend,
    minScore: 75
  });

  chk('Order berubah status menjadi FILLED setelah low menjemput entry', cache.slPlusLocks['XAU/USD'].filled === true);
  chk('SL+ belum dikirim karena baru bergerak tipis (+1 pt dari entry, belum 38% target)', sentMessages.length === 1);

  // Run cycle 4: Harga melesat naik mencapai >= 38% menuju TP1 (Target dist = 20, 38% = 7.6 pt -> harga >= 2657.6)
  const candlesRally = [...candles];
  candlesRally[candlesRally.length - 1] = { time: 5000, open: 2651, high: 2660.0, low: 2650, close: 2659.0, volume: 300 };

  await processInstrumentAnalysis({
    inst,
    candles: candlesRally,
    a: mockAnalysis,
    cache,
    sendFn: mockSend,
    minScore: 75
  });

  chk('Pesan SL+ (0-Risk) kini terkirim sah setelah order terisi dan melaju +38% profit', sentMessages.length === 2);
  chk('Pesan memuat level 0-Risk BE+', sentMessages[1].includes('SL+ TERPICU (0-RISK)') && sentMessages[1].includes('TEREKSEKUSI & PROFIT BERJALAN'));
  chk('Flag notifiedSlPlus menjadi true', cache.slPlusLocks['XAU/USD'].notifiedSlPlus === true);

  // Run cycle 5: Harga mencapai target TP1 (2670)
  const candlesTp1 = [...candles];
  candlesTp1[candlesTp1.length - 1] = { time: 6000, open: 2665, high: 2672.0, low: 2664, close: 2671.0, volume: 400 };

  await processInstrumentAnalysis({
    inst,
    candles: candlesTp1,
    a: mockAnalysis,
    cache,
    sendFn: mockSend,
    minScore: 75
  });

  chk('Pesan TP1 Tercapai terkirim', sentMessages.length === 3 && sentMessages[2].includes('TAKE PROFIT 1 TERCAPAI!'));
  chk('Lock dihapus dari cache setelah TP1 terpenuhi', cache.slPlusLocks['XAU/USD'] === undefined);
});

// 2. Journal & Storage Preservation Checks
(() => {
  // Skenario dimana OB sangat dangkal dekat harga
  const ctxTight = {
    price: 100, atr: 2.0, brain: 'SNIPER',
    impulseHigh: 101, impulseLow: 99.8, // Swing low hanya 0.2 pt dari price!
    bullOb: { top: 99.9, bottom: 99.7 },
    recentHigh: 101, poc: 99.8
  };
  const levels = SE.buildInstitutionalLevels('LONG', ctxTight);
  const riskDist = levels.entry - levels.sl;

  chk('Jarak SL sniper setidaknya 1.2x ATR (anti-fakeout spread)', riskDist >= 1.2 * 2.0 - 1e-6);
  chk('SL berada di bawah entry', levels.sl < levels.entry);
  chk('TP1 berada di atas entry & live price', levels.tp1 > levels.entry && levels.tp1 > ctxTight.price);

  const ctxScalp = { ...ctxTight, brain: 'SCALP' };
  const levelsScalp = SE.buildInstitutionalLevels('LONG', ctxScalp);
  const scalpRiskDist = levelsScalp.entry - levelsScalp.sl;
  chk('Jarak SL scalp setidaknya 1.0x ATR (anti-fakeout wicks)', scalpRiskDist >= 1.0 * 2.0 - 1e-6);
})();

(() => {
  const ctxNoBelow = {
    price: 100, atr: 2.0, brain: 'SNIPER',
    impulseHigh: 100, impulseLow: 92,
    bullOb: null, bullFvg: null, poc: null
  };
  const levels = SE.buildInstitutionalLevels('LONG', ctxNoBelow);
  chk('Entry LONG diberi diskon pullback dan tidak membeli langsung di pucuk (entry < livePrice)', levels.entry < ctxNoBelow.price);
  chk('Diskon pullback proporsional terhadap ATR', ctxNoBelow.price - levels.entry >= 0.15 * ctxNoBelow.atr);
})();

(() => {
  chk('Format JPY 3 desimal', formatP(87.3284, 'NZD/JPY') === '87.328');
  chk('Format Emas 2 desimal', formatP(2650.456, 'XAU/USD') === '2650.46');
  chk('Format Kripto besar 2 desimal', formatP(91250.789, 'BTC/USDT') === '91250.79');
  chk('Format Forex standar 4 desimal', formatP(1.08543, 'EUR/USD') === '1.0854');
})();

// 3. Verifikasi Logika Eksekusi Limit Order & Proteksi SL+ (Bebas False SL+ Trigger)
(() => {
  // Kasus SHORT: Anchor close di 56.000, entry limit di 57.831 (antrian atas).
  // Harga turun ke 55.200 tanpa pernah menyentuh 57.831.
  const analysisShort = {
    symbol: 'BTC/USDT',
    timeframe: 'M5',
    signalEligible: true,
    direction: 'SHORT',
    levels: {
      entry: 57831,
      sl: 59000,
      tp1: 54000,
      tp2: 52000,
      tp3: 50000
    },
    anchorClosedTime: 1000000,
    anchorClosedClose: 56000,
    lastPrice: 56000,
    atr: 200
  };
  const lock = SE.createSignalLock(analysisShort, 'BTC/USDT');

  chk('Limit order SHORT awalnya belum terisi (filled === false)', lock.filled === false);

  // Candle selanjutnya: High hanya mencapai 57000 (belum sampai entry 57831), Low 55000
  const candlesNotHit = [
    { time: 1000000, open: 56200, high: 56500, low: 55800, close: 56000 },
    { time: 1000300, open: 56000, high: 57000, low: 55000, close: 55200 }
  ];

  const verdictNotHit = SE.validateSignalLock(lock, candlesNotHit, 55200);
  chk('Order SHORT tetap belum terisi jika candle high < entry limit', verdictNotHit.filled === false);
  chk('bePlusActive TIDAK BOLEH aktif pada order SHORT yang belum terisi!', verdictNotHit.bePlusActive === false);
  chk('Status verdict SHORT adalah ACTIVE (menunggu jemputan antrian)', verdictNotHit.status === 'ACTIVE');

  // Candle berikutnya: High menembus 57900 (entry 57831 terjemput)
  const candlesHit = [
    { time: 1000000, open: 56200, high: 56500, low: 55800, close: 56000 },
    { time: 1000300, open: 56000, high: 57900, low: 56500, close: 57100 }
  ];
  const verdictHit = SE.validateSignalLock(lock, candlesHit, 57100);
  chk('Order SHORT menjadi terisi setelah high candle mencapai level entry', verdictHit.filled === true);

  // Setelah terisi, harga turun mencapai zona 0-Risk (target 38% atau bePlus trigger)
  const lockFilled = { ...lock, filled: true };
  const candlesProfit = [
    { time: 1000000, open: 56200, high: 56500, low: 55800, close: 56000 },
    { time: 1000300, open: 56000, high: 57900, low: 56500, close: 57100 },
    { time: 1000600, open: 57100, high: 57200, low: 55500, close: 55800 }
  ];
  const verdictProfit = SE.validateSignalLock(lockFilled, candlesProfit, 55800);
  chk('bePlusActive sah aktif setelah order SHORT terisi dan harga masuk floating profit aman', verdictProfit.bePlusActive === true);
})();

(() => {
  // Kasus LONG: Anchor di 2650, entry limit di 2640 (antrian bawah).
  const analysisLong = {
    symbol: 'XAU/USD',
    timeframe: 'M15',
    signalEligible: true,
    direction: 'LONG',
    levels: {
      entry: 2640,
      sl: 2620,
      tp1: 2670,
      tp2: 2690,
      tp3: 2710
    },
    anchorClosedTime: 2000000,
    anchorClosedClose: 2650,
    lastPrice: 2650,
    atr: 5
  };
  const lockLong = SE.createSignalLock(analysisLong, 'XAU/USD');

  chk('LONG limit order awalnya belum terisi (filled === false)', lockLong.filled === false);

  const candlesPending = [
    { time: 2000000, open: 2648, high: 2652, low: 2645, close: 2650 },
    { time: 2000900, open: 2650, high: 2660, low: 2644, close: 2655 }
  ];
  const vPending = SE.validateSignalLock(lockLong, candlesPending, 2655);
  chk('LONG order belum terisi jika candle low > entry limit', vPending.filled === false);
  chk('bePlusActive tidak aktif jika order belum terisi', vPending.bePlusActive === false);
  chk('Status LONG adalah ACTIVE saat pending', vPending.status === 'ACTIVE');

  // Harga melesat ke 2680 tanpa pullback ke 2640 (MISSED)
  const candlesUp = [
    { time: 2000000, open: 2648, high: 2652, low: 2645, close: 2650 },
    { time: 2000900, open: 2650, high: 2680, low: 2644, close: 2675 }
  ];
  const vUp = SE.validateSignalLock(lockLong, candlesUp, 2675);
  chk('Jika harga menyentuh TP1 sebelum order terisi, status adalah MISSED', vUp.status === 'MISSED');
})();

// 4. Sinkronisasi Cloud Journal API Endpoint (functions/api/market/journal-sync.js)
await asyncChk('Cloud Journal Sync Endpoint: GET, POST save_lock, and record_outcome', async () => {
  const optRes = await onRequestOptions();
  chk('CORS OPTIONS mengembalikan status 204', optRes.status === 204);

  const getRes1 = await onRequestGet({ env: {} });
  const data1 = await getRes1.json();
  chk('GET mengembalikan respons ok: true', data1.ok === true);
  chk('GET memiliki daftar activeLocks bertipe array', Array.isArray(data1.activeLocks));

  const testLock = {
    symbol: 'SOL/USDT',
    tf: 'M15',
    direction: 'LONG',
    entry: 185.50,
    sl: 180.00,
    tp1: 195.00,
    tp2: 205.00,
    tp3: 215.00,
    slPlus: 186.00,
    filled: false,
    score: 85,
    issuedAt: Date.now()
  };

  const reqSave = new Request('http://localhost/api/market/journal-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save_lock', lock: testLock })
  });
  const postRes1 = await onRequestPost({ request: reqSave, env: {} });
  const postData1 = await postRes1.json();
  chk('POST save_lock berhasil disimpan', postData1.ok === true && postData1.saved === true);

  const getRes2 = await onRequestGet({ env: {} });
  const data2 = await getRes2.json();
  const solLock = data2.activeLocks.find(l => l.symbol === 'SOL/USDT' && l.tf === 'M15');
  chk('Lock SOL/USDT terdata di activeLocks cloud', !!solLock && solLock.entry === 185.50);

  const reqOutcome = new Request('http://localhost/api/market/journal-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'record_outcome',
      outcome: {
        symbol: 'SOL/USDT',
        tf: 'M15',
        status: 'TP_HIT',
        reason: 'Target Take Profit 1 tercapai',
        at: Date.now()
      }
    })
  });
  const postRes2 = await onRequestPost({ request: reqOutcome, env: {} });
  const postData2 = await postRes2.json();
  chk('POST record_outcome berhasil dicatat', postData2.ok === true);

  const getRes3 = await onRequestGet({ env: {} });
  const data3 = await getRes3.json();
  const solLockActive = data3.activeLocks.find(l => l.symbol === 'SOL/USDT' && l.tf === 'M15');
  const solOutcome = data3.recentOutcomes.find(o => o.symbol === 'SOL/USDT' && o.tf === 'M15');
  chk('Lock aktif dihapus setelah outcome tercapai', !solLockActive);
  chk('Outcome tercatat di recentOutcomes', !!solOutcome && solOutcome.status === 'TP_HIT');
});

// 5. Integrasi Sinkronisasi Cloud Sentinel ke Jurnal
await asyncChk('Sentinel menyinkronkan active locks dari cloud secara otomatis', async () => {
  const mockCache = { notified: {}, slPlusLocks: {} };
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/api/market/journal-sync')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          activeLocks: [
            { symbol: 'ETH/USDT', tf: 'H1', direction: 'LONG', entry: 3200, sl: 3100, tp1: 3400, filled: false }
          ]
        })
      };
    }
    return origFetch ? origFetch(url) : { ok: false };
  };

  try {
    await syncActiveLocksFromCloud(mockCache);
    chk('Sentinel cache memuat lock ETH/USDT dari cloud', !!mockCache.slPlusLocks['ETH/USDT']);
    chk('Lock ETH/USDT mempertahankan level entry & filled: false', mockCache.slPlusLocks['ETH/USDT'].entry === 3200 && mockCache.slPlusLocks['ETH/USDT'].filled === false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// 6. Kasus Nyata EUR/USD (H1): BUY LIMIT @ 1.0978, Live Price 1.0988, Low Candle 1.0972
await asyncChk('Kasus Nyata EUR/USD: Mencegah Premature Fill & False SL+ pada Candle Penerbitan Sinyal', async () => {
  const sentMessages = [];
  const mockSend = async (msg) => { sentMessages.push(msg); };
  const cache = { notified: {}, slPlusLocks: {} };

  const inst = { sym: 'EUR/USD', tf: 'H1', type: 'forex', hz: 'intraday' };
  // Candle yang sedang berjalan: open 1.0970, high 1.0990, low 1.0972, close/livePrice 1.0988
  // Perhatikan: low 1.0972 terbentuk di masa lalu sebelum sinyal terbit!
  const candles = [];
  for (let i = 0; i < 50; i++) {
    candles.push({ time: 1000 + i * 3600, open: 1.0960, high: 1.0975, low: 1.0955, close: 1.0970, volume: 1000 });
  }
  candles[candles.length - 1] = {
    time: 1000 + 49 * 3600,
    open: 1.0970,
    high: 1.0990,
    low: 1.0972, // low di bawah entry 1.0978, TAPI terjadi SEBELUM sinyal BUY LIMIT terbit!
    close: 1.0988, // live price saat ini di atas entry
    volume: 2500
  };

  const eurAnalysis = {
    direction: 'LONG',
    confluenceScore: 84,
    signalEligible: true,
    signalTier: 'ELITE',
    atr: 0.0018,
    regime: 'Bullish Institutional Order Flow',
    anchorClosedTime: 1000 + 49 * 3600,
    lastPrice: 1.0988,
    entryType: 'LIMIT',
    levels: {
      entry: 1.0978, // Limit order di bawah live price 1.0988
      sl: 1.0955,
      tp1: 1.1002,
      tp2: 1.1020,
      tp3: 1.1040
    }
  };

  // Siklus 1: Sinyal EUR/USD diterbitkan
  await processInstrumentAnalysis({
    inst,
    candles,
    a: eurAnalysis,
    cache,
    sendFn: mockSend,
    minScore: 78
  });

  chk('Hanya sinyal BUY LIMIT yang terkirim pada siklus 1', sentMessages.length === 1);
  chk('Pesan memuat instruksi BUY LIMIT @ 1.0978', sentMessages[0].includes('BUY LIMIT') && sentMessages[0].includes('1.0978'));
  chk('Order EUR/USD berstatus PENDING_FILL', cache.slPlusLocks['EUR/USD'].status === 'PENDING_FILL');
  chk('Order EUR/USD filled adalah false', cache.slPlusLocks['EUR/USD'].filled === false);
  chk('Order EUR/USD notifiedSlPlus adalah false', cache.slPlusLocks['EUR/USD'].notifiedSlPlus === false);

  // Siklus 2: 1 Menit kemudian (harga masih di candle yang sama, tick 1.0989, belum pullback ke 1.0978)
  const candlesSameBar = [...candles];
  candlesSameBar[candlesSameBar.length - 1] = {
    ...candlesSameBar[candlesSameBar.length - 1],
    high: 1.0991,
    close: 1.0989 // harga live masih 1.0989, belum jemput entry
  };

  await processInstrumentAnalysis({
    inst,
    candles: candlesSameBar,
    a: eurAnalysis,
    cache,
    sendFn: mockSend,
    minScore: 78
  });

  chk('Pesan TIDAK bertambah pada siklus 2 (SL+ DILARANG terpicu karena order belum terjemput)', sentMessages.length === 1);
  chk('Order EUR/USD tetap PENDING_FILL pada candle yang sama', cache.slPlusLocks['EUR/USD'].status === 'PENDING_FILL');
  chk('Order EUR/USD tetap filled === false', cache.slPlusLocks['EUR/USD'].filled === false);

  // Siklus 3: Candle berikutnya turun menjemput entry limit (low: 1.0976 <= 1.0978)
  const candlesNextBarFill = [...candles, {
    time: 1000 + 50 * 3600,
    open: 1.0988,
    high: 1.0989,
    low: 1.0976, // jemput entry limit!
    close: 1.0980,
    volume: 3000
  }];

  await processInstrumentAnalysis({
    inst,
    candles: candlesNextBarFill,
    a: eurAnalysis,
    cache,
    sendFn: mockSend,
    minScore: 78
  });

  chk('Order EUR/USD berhasil terisi setelah candle baru menjemput entry', cache.slPlusLocks['EUR/USD'].filled === true);
  chk('SL+ belum terpicu karena profit baru +2 pip (belum 38% target)', sentMessages.length === 1);

  // Siklus 4: Harga melaju mencapai ambang SL+ (38% dari 24 pips = +9.1 pips -> harga >= 1.0988)
  const candlesNextBarRally = [...candlesNextBarFill];
  candlesNextBarRally[candlesNextBarRally.length - 1] = {
    ...candlesNextBarRally[candlesNextBarRally.length - 1],
    high: 1.0992,
    close: 1.0990
  };

  await processInstrumentAnalysis({
    inst,
    candles: candlesNextBarRally,
    a: eurAnalysis,
    cache,
    sendFn: mockSend,
    minScore: 78
  });

  chk('Pesan SL+ (0-Risk) kini terkirim sah setelah order terjemput dan mencapai zona aman', sentMessages.length === 2);
  chk('Pesan ke-2 memuat peringatan SL+ (0-Risk)', sentMessages[1].includes('SL+ TERPICU (0-RISK)'));
});

console.log(`\nSENTINEL & JOURNAL REGRESSION SUITE: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
