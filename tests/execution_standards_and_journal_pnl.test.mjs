import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf-8');

test('STANDAR EKSEKUSI MINIMAL SKOR 78 & FILTER KELAYAKAN RADAR', async (t) => {
  // Ekstraksi fungsi evaluateSignalViability dan isActionableRadarSignal dari app.js
  const mockContext = {
    state: { mode: 'trader' },
    T: (k, def) => def,
    getSignalLock: () => null,
    num: (a, b) => Number(a != null ? a : b),
    window: { XSI18N: { getLanguage: () => 'id' } }
  };

  const evalMatch = appJs.match(/function evaluateSignalViability\([\s\S]*?\n\}\ntry \{ window\.evaluateSignalViability/);
  assert.ok(evalMatch, 'evaluateSignalViability harus ditemukan');
  const evalCode = evalMatch[0].replace(/try \{ window\.evaluateSignalViability[\s\S]*$/, '');

  const actMatch = appJs.match(/function isActionableRadarSignal\([\s\S]*?\n\}/);
  assert.ok(actMatch, 'isActionableRadarSignal harus ditemukan');

  const evalFactory = new Function('mockCtx', `
    const state = mockCtx.state;
    const T = mockCtx.T;
    const getSignalLock = mockCtx.getSignalLock;
    const num = mockCtx.num;
    const window = mockCtx.window;
    function isAssetMarketOpen(s) { return true; }
    ${evalCode}
    ${actMatch[0]}
    return { evaluateSignalViability, isActionableRadarSignal };
  `);

  const { evaluateSignalViability, isActionableRadarSignal } = evalFactory(mockContext);

  await t.test('1. Sinyal dengan skor di bawah 78 (mis. skor 65) diklasifikasikan sebagai WATCHLIST (bukan FRESH)', () => {
    const sub78Item = {
      sym: 'BTC/USDT',
      tf: 'H1',
      price: 90000,
      analysis: {
        symbol: 'BTC/USDT',
        timeframe: 'H1',
        direction: 'LONG',
        convictionScore: 65,
        confluenceScore: 65,
        lastPrice: 90000,
        atr: 500,
        topDown: { isAligned: true, macroBias: 'BULLISH' },
        levels: { entry: 89900, sl: 88500, tp1: 92000, rrRatio: 1.5 }
      }
    };
    const viability = evaluateSignalViability(sub78Item);
    assert.strictEqual(viability.key, 'WATCHLIST', 'Sinyal ber-skor < 78 tidak boleh diberi badge FRESH');
    assert.strictEqual(viability.worth, false, 'Sinyal ber-skor < 78 tidak boleh bernilai worth: true');
    assert.ok(viability.label.includes('65/100'), 'Label harus menyematkan skor aktual');
  });

  await t.test('2. Sinyal dengan skor >= 78 (mis. skor 82) lulus sebagai FRESH (Layak Eksekusi)', () => {
    const eliteItem = {
      sym: 'BTC/USDT',
      tf: 'H1',
      price: 90000,
      analysis: {
        symbol: 'BTC/USDT',
        timeframe: 'H1',
        direction: 'LONG',
        convictionScore: 82,
        confluenceScore: 82,
        lastPrice: 90000,
        atr: 500,
        topDown: { isAligned: true, macroBias: 'BULLISH' },
        levels: { entry: 89950, sl: 88500, tp1: 92500, rrRatio: 1.7 }
      }
    };
    const viability = evaluateSignalViability(eliteItem);
    assert.strictEqual(viability.key, 'FRESH', 'Sinyal ber-skor >= 78 harus diklasifikasikan FRESH');
    assert.strictEqual(viability.worth, true, 'Sinyal ber-skor >= 78 harus bernilai worth: true');
  });

  await t.test('3. isActionableRadarSignal menolak sinyal skor < 78 dan meloloskan skor >= 78', () => {
    const itemLow = {
      analysis: {
        direction: 'LONG',
        convictionScore: 68,
        confluenceScore: 68,
        levels: { entry: 1.2500 }
      }
    };
    assert.strictEqual(isActionableRadarSignal(itemLow), false, 'Radar actionable harus menolak sinyal skor 68');

    const itemHigh = {
      analysis: {
        direction: 'LONG',
        convictionScore: 80,
        confluenceScore: 80,
        levels: { entry: 1.2500 }
      }
    };
    assert.strictEqual(isActionableRadarSignal(itemHigh), true, 'Radar actionable harus menerima sinyal skor 80');
  });
});

test('KALKULASI PROFIT JURNAL DEX MEME & ANTI-STAGNAN 0%', async (t) => {
  // Ekstrak syncRecommendedMemeToJournal
  const syncMatch = appJs.match(/function syncRecommendedMemeToJournal\([\s\S]*?\n\}\n\nfunction memeJournalStore/);
  assert.ok(syncMatch, 'syncRecommendedMemeToJournal harus ditemukan');
  const syncCode = syncMatch[0].replace(/\nfunction memeJournalStore[\s\S]*$/, '');

  let store = [];
  const mockLocalStorage = {
    getItem: (key) => JSON.stringify(store),
    setItem: (key, val) => {
      try { store = JSON.parse(val); } catch (e) { store = []; }
    }
  };

  const memeFactory = new Function('mockCtx', `
    const MEME_JOURNAL_KEY = 'XSTARZG_MEME_JOURNAL_V1';
    const DEFAULT_MEME_CATALOG = [];
    let memeScanPool = [];
    const localStorage = mockCtx.localStorage;
    const saveMemeJournalStore = function(arr) { mockCtx.localStorage.setItem('XSTARZG_MEME_JOURNAL_V1', JSON.stringify(arr)); };
    ${syncCode}
    return { syncRecommendedMemeToJournal, getStore: () => store };
  `);

  const { syncRecommendedMemeToJournal } = memeFactory({ localStorage: mockLocalStorage });

  await t.test('1. Sinyal koin micin dengan momentum positif menghasilkan entry price berbasis breakout, bukan 0% profit', () => {
    const sampleItems = [
      {
        symbol: 'PEPE',
        name: 'Pepe',
        chain: 'ethereum',
        chainLabel: '💠 Ethereum',
        basePrice: 0.000021,
        safetyScore: 92,
        change1h: 15.0, // Naik 15% dalam 1 jam terakhir
        change24h: 30.0,
        address: 'pepe_pool'
      }
    ];

    syncRecommendedMemeToJournal(sampleItems);
    assert.strictEqual(store.length, 1, 'Token harus tersinkronisasi ke jurnal');

    const saved = store[0];
    assert.strictEqual(saved.symbol, 'PEPE');
    assert.strictEqual(saved.currentPrice, 0.000021);
    // Baseline harga beli dihitung dari breakout: 0.000021 / (1 + 0.15) = 0.00001826...
    assert.ok(saved.buyPrice < saved.currentPrice, 'Harga beli baseline harus lebih rendah dari harga breakout saat ini');

    const mult = saved.currentPrice / saved.buyPrice;
    assert.ok(mult > 1.05, `Multiplier harus merefleksikan keuntungan breakout (didapat ${mult.toFixed(2)}x)`);
    const gainPct = (mult - 1) * 100;
    assert.ok(gainPct >= 10, `Gain PnL harus di atas 10% (didapat ${gainPct.toFixed(1)}%)`);
  });
});

test('NETRALISASI SEED FEED & PERLINDUNGAN ALARM AKURASI', async (t) => {
  await t.test('1. computeQuantEngine menetralkan feed sintetis LOCAL_SEED', () => {
    assert.ok(appJs.includes("if (!feedReal || isFeedEstimate || feedSource === 'LOCAL_SEED')"));
    assert.ok(appJs.includes("a.convictionScore = 50;"));
    assert.ok(appJs.includes("a.signalEligible = false;"));
  });

  await t.test('2. renderAllVisuals mencegah penulisan radar dan alarm pada feed estimasi atau seed lokal', () => {
    assert.ok(appJs.includes("analysis.feedSource === 'LOCAL_SEED'") || appJs.includes("analysis.source === 'LOCAL_SEED'"));
    assert.ok(appJs.includes("writeBackRadarPools(analysis)"));
  });

  await t.test('3. checkSignalAlarm memeriksa status pasar dan kompatibilitas harga', () => {
    assert.ok(appJs.includes("if (!isAssetMarketOpen(sym)) return;"));
    assert.ok(appJs.includes("isPriceCompatibleWithSymbol(lastP, sym)"));
  });
});
