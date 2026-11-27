import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as SE from '../public/js/shared/signal-engine.js';

// Deret candle deterministik dengan drift tetap (tanpa Math.random).
function trendCandles({ count = 600, step = 300, start = 100, drift = 0.0012, dir = 1 } = {}) {
  const now = Math.floor(Date.now() / 1000 / step) * step;
  const rows = [];
  let price = start;
  for (let i = count - 1; i >= 0; i--) {
    const open = price;
    const close = price * (1 + dir * drift);
    rows.push({
      time: now - i * step,
      open,
      high: Math.max(open, close) * 1.0006,
      low: Math.min(open, close) * 0.9994,
      close,
      volume: 1000 + (i % 7) * 40
    });
    price = close;
  }
  return rows;
}

test('SNIPER MULTI-TIMEFRAME: setiap TF dibaca dengan bukti yang sama', async (t) => {
  await t.test('1. Stack dari feed M5 memuat D1→M1; TF di bawah data dasar jujur ditandai belum tersedia', () => {
    const candles = trendCandles({ count: 900, step: 300 });
    const stack = SE.buildTimeframeStack(candles, 'M5');
    assert.deepEqual(stack.rows.map(r => r.id), ['D1', 'H4', 'H1', 'M15', 'M5', 'M1']);

    const byId = Object.fromEntries(stack.rows.map(r => [r.id, r]));
    assert.equal(byId.M5.available, true, 'TF dasar harus terbaca (native)');
    assert.equal(byId.M5.source, 'native');
    assert.equal(byId.H4.source, 'resampled');
    assert.ok(byId.H1.available && byId.M15.available);
    assert.equal(byId.M1.available, false, 'M1 tidak boleh ditebak dari feed M5');
    assert.equal(byId.M1.reasonCode, 'BELOW_BASE');
    assert.equal(byId.M5.bias, 'BULLISH');
  });

  await t.test('2. Eksekusi M5/M1: dua candle searah = konfirmasi, TF yang berlawanan = tahan', () => {
    const up = trendCandles({ count: 300, step: 300, dir: 1 });
    const down = trendCandles({ count: 300, step: 300, dir: -1, start: 200 });

    const confirmed = SE.confirmExecutionTimeframes({ M5: up, M1: up }, 'LONG');
    assert.equal(confirmed.available, true);
    assert.equal(confirmed.bias, 'BULLISH');
    assert.equal(confirmed.confirmed, true, 'M5+M1 searah wajib dianggap konfirmasi');
    assert.equal(confirmed.source, 'M5+M1');

    const against = SE.confirmExecutionTimeframes({ M5: up, M1: up }, 'SHORT');
    assert.equal(against.confirmed, false, 'arah setup yang berlawanan tidak boleh lolos');

    const split = SE.confirmExecutionTimeframes({ M5: up, M1: down }, 'LONG');
    assert.equal(split.bias, 'NEUTRAL', 'M5 vs M1 bertentangan = netral, bukan tebakan');
    assert.equal(split.confirmed, false);
  });

  await t.test('3. Top-down menyatukan seluruh TF dan menandai eksekusi yang belum terverifikasi', () => {
    const h1 = trendCandles({ count: 800, step: 3600 });
    const td = SE.detectTopDownAlignment(h1, 'XAU/USD', 'H1');
    assert.ok(td);
    assert.equal(td.timeframes.rows.length, 6);
    assert.equal(td.macroBias, 'BULLISH');
    assert.equal(td.structBias, 'BULLISH');
    assert.equal(td.isAligned, true);
    assert.equal(td.execConfirmed, null, 'M5/M1 tidak bisa diturunkan dari H1 — jangan diklaim konfirmasi');
    assert.equal(td.execSource, 'FALLBACK_H1');
    assert.equal(td.isFullyAligned, false);
    const m1 = td.timeframes.rows.find(r => r.id === 'M1');
    assert.equal(m1.available, false);
    assert.equal(m1.reasonCode, 'BELOW_BASE');
    assert.ok(td.agreementPct >= 0 && td.agreementPct <= 100);
    assert.ok(Array.isArray(td.conflicts));
  });

  await t.test('4. Analisis M5 menandai eksekusi terkonfirmasi & laporan runFullAnalysis membawa tangga TF', () => {
    const m5 = trendCandles({ count: 900, step: 300 });
    const td = SE.detectTopDownAlignment(m5, 'BTC/USDT', 'M5');
    assert.equal(td.execConfirmed, true);
    assert.equal(td.execSource, 'M5');
    assert.equal(td.isAligned, true);

    const a = SE.runFullAnalysis({ symbol: 'BTC/USDT', timeframe: 'M5', candles: m5, mode: 'trader', horizon: 'all' });
    assert.ok(a.timeframes && Array.isArray(a.timeframes.rows));
    assert.equal(a.timeframes.baseTf, 'M5');
    assert.equal(a.timeframes.rows.find(r => r.id === 'M5').available, true);
    assert.equal(typeof a.topDown.execConfirmed, 'boolean');
  });

  await t.test('5. Bot cloud & dashboard memakai gerbang M5/M1 dan tombol Performance benar-benar terpasang', () => {
    const sentinel = fs.readFileSync(path.join(process.cwd(), 'scripts/market-sentinel.mjs'), 'utf8');
    const app = fs.readFileSync(path.join(process.cwd(), 'public/app.js'), 'utf8');

    assert.ok(sentinel.includes('confirmLowerTimeframes(inst, dir)'), 'sinyal TF besar wajib dicek ke feed M5/M1');
    assert.ok(sentinel.includes("confirmExecutionTimeframes({ M5: m5, M1: m1 }, direction || null)"));
    assert.ok(sentinel.includes('Eksekusi BELUM searah'), 'sinyal ditahan bila pemicu M5/M1 berbalik');
    assert.ok(sentinel.includes('tfEvidenceLine(td)'), 'notifikasi wajib menampilkan bukti semua TF');
    assert.ok(app.includes("bind('btnModePerformance', function () { setMode('performance'); });"), 'halaman Performance harus bisa dibuka');
  });
});
