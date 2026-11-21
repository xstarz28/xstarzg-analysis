// tests/sentinel-journal-fix.test.mjs
// Verifikasi perbaikan Bug 04:45 AM Sentinel (SL+ prematur), Journal hilang, dan fakeout levels

import assert from 'node:assert';
import { processInstrumentAnalysis, formatP } from '../scripts/market-sentinel.mjs';
import * as SE from '../public/js/shared/signal-engine.js';

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

console.log(`\nSENTINEL & JOURNAL REGRESSION SUITE: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
