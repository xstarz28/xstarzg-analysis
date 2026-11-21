import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as SE from '../public/js/shared/signal-engine.js';
import { processInstrumentAnalysis } from '../scripts/market-sentinel.mjs';

test('TOP-DOWN MULTI-TIMEFRAME & INSTITUTIONAL SESSION ARCHITECTURE', async (t) => {

  await t.test('1. PAIR_SESSION_MAP memetakan sesi institusional optimal per pair', () => {
    const map = SE.PAIR_SESSION_MAP;
    assert.ok(map, 'PAIR_SESSION_MAP harus diexport');
    assert.strictEqual(map['EUR/USD'].best, 'London + New York');
    assert.strictEqual(map['GBP/USD'].best, 'London + New York');
    assert.strictEqual(map['USD/JPY'].best, 'Tokyo + London');
    assert.strictEqual(map['AUD/USD'].best, 'Sydney + Tokyo');
    assert.strictEqual(map['NZD/USD'].best, 'Sydney + Tokyo');
    assert.strictEqual(map['USD/CAD'].best, 'New York');
    assert.strictEqual(map['EUR/GBP'].best, 'London');
    assert.strictEqual(map['EUR/JPY'].best, 'London');
    assert.strictEqual(map['GBP/JPY'].best, 'London');
    assert.strictEqual(map['XAU/USD'].best, 'London + New York');
  });

  await t.test('2. getInstrumentSessionInfo menghitung status sesi aktif dan keoptimalan jam trading', () => {
    // 14:00 UTC = Overlap London + New York
    const tOverlap = new Date('2026-11-12T14:00:00Z').getTime() / 1000;
    const eurusdOverlap = SE.getInstrumentSessionInfo('EUR/USD', tOverlap);
    assert.strictEqual(eurusdOverlap.isOptimal, true, 'EUR/USD harus optimal saat overlap London + NY');
    assert.strictEqual(eurusdOverlap.isOverlapLondonNY, true);
    assert.strictEqual(eurusdOverlap.bestSession, 'London + New York');

    const xauOverlap = SE.getInstrumentSessionInfo('XAU/USD', tOverlap);
    assert.strictEqual(xauOverlap.isOptimal, true, 'Emas/XAU harus optimal saat London Fix & NY Open');

    // 04:00 UTC = Sesi Tokyo / Asia
    const tAsia = new Date('2026-11-12T04:00:00Z').getTime() / 1000;
    const audusdAsia = SE.getInstrumentSessionInfo('AUD/USD', tAsia);
    assert.strictEqual(audusdAsia.isOptimal, true, 'AUD/USD optimal pada sesi Asia/Tokyo');

    // 08:30 UTC = London Open
    const tLondon = new Date('2026-11-12T08:30:00Z').getTime() / 1000;
    const gbpjpyLondon = SE.getInstrumentSessionInfo('GBP/JPY', tLondon);
    assert.strictEqual(gbpjpyLondon.isOptimal, true, 'GBP/JPY optimal saat London Open');

    // Kripto 24/7
    const btcSession = SE.getInstrumentSessionInfo('BTC/USDT', tOverlap);
    assert.ok(btcSession.bestSession.includes('24/7'));
    assert.strictEqual(btcSession.isOptimal, true);
  });

  await t.test('3. detectAsiaLondonOrderFlow mendeteksi sweep Asia Low -> Reclaim Bullish (Judas Swing)', () => {
    const candles = [];
    const DAY = 86400;
    const baseTime = Math.floor(new Date('2026-11-12T14:00:00Z').getTime() / 1000 / DAY) * DAY;

    // Buat candle sesi Asia (00:00 - 08:00 UTC, range 2600 - 2620)
    for (let h = 0; h < 8; h++) {
      candles.push({
        time: baseTime + h * 3600,
        open: 2610,
        high: 2620,
        low: 2600,
        close: 2612,
        volume: 1000
      });
    }

    // London sweep di bawah Asia Low (low: 2595 < 2600), lalu reclaim close di 2615 > 2600
    for (let h = 8; h < 24; h++) {
      candles.push({
        time: baseTime + h * 3600,
        open: 2605,
        high: 2618,
        low: h === 9 ? 2595 : 2602,
        close: 2615,
        volume: 2500
      });
    }

    const flow = SE.detectAsiaLondonOrderFlow(candles);
    assert.ok(flow, 'Order flow harus terdeteksi');
    assert.strictEqual(flow.asiaHigh, 2620);
    assert.strictEqual(flow.asiaLow, 2600);
    assert.strictEqual(flow.londonSweptLow, true);
    assert.strictEqual(flow.sweepStatus, 'ASIA_LOW_SWEPT_BULLISH');
    assert.strictEqual(flow.orderFlowBias, 'BULLISH');
    assert.ok(flow.story.includes('Judas Swing') || flow.story.includes('reclaim'));
  });

  await t.test('4. detectTopDownAlignment menyatukan HTF 1D/4H arah, 1H/15m struktur, & 5m konfirmasi', () => {
    // Generate trending bullish candles
    const candles = [];
    let p = 100;
    for (let i = 0; i < 80; i++) {
      p += 0.5;
      candles.push({
        time: 1700000000 + i * 3600,
        open: p - 0.2,
        high: p + 0.8,
        low: p - 0.4,
        close: p + 0.3,
        volume: 1500
      });
    }

    const td = SE.detectTopDownAlignment(candles, 'EUR/USD', 'H1');
    assert.ok(td, 'TopDown alignment harus terdeteksi');
    assert.ok(['BULLISH', 'BEARISH', 'NEUTRAL'].includes(td.macroBias));
    assert.ok(['BULLISH', 'BEARISH', 'NEUTRAL'].includes(td.structBias));
    assert.ok(typeof td.isAligned === 'boolean');
    assert.ok(td.alignmentLabel.includes('SEARAH MARKET') || td.alignmentLabel.includes('MENUNGGU KESELARASAN'));
  });

  await t.test('5. runFullAnalysis menyertakan sessionInfo & topDown serta memblokir sinyal melawan arah HTF', () => {
    const candles = [];
    let p = 2000;
    for (let i = 0; i < 90; i++) {
      p += 2.0;
      candles.push({
        time: 1700000000 + i * 3600,
        open: p - 1,
        high: p + 3,
        low: p - 2,
        close: p + 1.5,
        volume: 2000
      });
    }

    const res = SE.runFullAnalysis({ symbol: 'XAU/USD', timeframe: 'H1', candles, mode: 'trader' });
    assert.ok(!res.error);
    assert.ok(res.sessionInfo, 'runFullAnalysis harus membawa sessionInfo');
    assert.ok(res.topDown, 'runFullAnalysis harus membawa topDown');
    assert.ok(res.topDown.macroBias);
    assert.strictEqual(res.sessionInfo.bestSession, 'London + New York');

    // Jika HTF makro BULLISH, maka veto short harus mengandung COUNTER_HTF_ALIGNMENT
    if (res.topDown.macroBias === 'BULLISH') {
      assert.ok(res.gating.vetoShort.includes('COUNTER_HTF_ALIGNMENT'), 'Setup SHORT harus diveto saat HTF Bullish');
    }
  });

  await t.test('6. market-sentinel memformat Top-Down Alignment & Sesi Optimal dalam Telegram alert', async () => {
    const sentMsg = [];
    const dummySend = async (m) => { sentMsg.push(m); };
    const cache = { notified: {}, slPlusLocks: {} };

    const mockCandles = [];
    for (let i = 0; i < 50; i++) {
      mockCandles.push({ time: 1700000000 + i * 3600, open: 2650, high: 2660, low: 2648, close: 2655, volume: 2000 });
    }

    const mockAnalysis = {
      confluenceScore: 82,
      direction: 'LONG',
      signalEligible: true,
      signalTier: 'ELITE',
      regime: 'INSTITUTIONAL TREND FLOW',
      anchorClosedTime: 1700000000 + 49 * 3600,
      levels: { entry: 2650, sl: 2635, tp1: 2675, tp2: 2690 },
      topDown: {
        isAligned: true,
        macroBias: 'BULLISH',
        structBias: 'BULLISH',
        sessionFlow: { story: 'London reclaim Asia Low' }
      },
      sessionInfo: {
        bestSession: 'London + New York',
        activeSessionName: 'London + New York (Overlap Peak)',
        isOptimal: true
      }
    };

    await processInstrumentAnalysis({
      inst: { sym: 'XAU/USD', tf: 'H1', hz: 'intraday' },
      candles: mockCandles,
      a: mockAnalysis,
      cache,
      sendFn: dummySend,
      minScore: 60
    });

    assert.strictEqual(sentMsg.length, 1);
    const alert = sentMsg[0];
    assert.ok(alert.includes('XSTARZG 24/7 CLOUD — PELUANG SKOR BESAR'));
    assert.ok(alert.includes('KESELARASAN PASAR (TOP-DOWN ALIGNED)'));
    assert.ok(alert.includes('1D–4H Makro: <b>BULLISH</b>'));
    assert.ok(alert.includes('Sesi Optimal:</b> <code>London + New York</code>'));
  });

  await t.test('7. UI index.html dan app.js menampilkan pipeline Top-Down dan menyaring sinyal searah', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8');
    const app = fs.readFileSync(path.join(process.cwd(), 'public/app.js'), 'utf8');

    assert.ok(html.includes('Daftar Sinyal Terkonfirmasi (Top-Down Market Alignment)'));
    assert.ok(html.includes('id="radarHorizonBar"'));
    assert.ok(html.includes('1D–4H') && html.includes('1H–15m') && html.includes('5m–1m'));
    assert.ok(app.includes('ALIGNED: 1D/4H'));
    assert.ok(app.includes('Sesi Optimal:'));
    assert.ok(app.includes('COUNTER_HTF_ALIGNMENT'));
  });

});
