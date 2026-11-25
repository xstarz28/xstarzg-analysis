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

test('JURNAL DEX HANYA MENYIMPAN INPUT MANUAL DAN TIDAK MEMBUAT KATALOG', () => {
  const syncMatch = appJs.match(/function syncRecommendedMemeToJournal\(\) \{ return \[\]; \}/);
  assert.ok(syncMatch, 'Fungsi sinkron rekomendasi harus no-op');
  const generated = new Function(`${syncMatch[0]}; return syncRecommendedMemeToJournal();`)();
  assert.deepStrictEqual(generated, []);
  assert.ok(appJs.includes('localStorage.getItem(journalStorageKey(MEME_JOURNAL_KEY))'));
});

test('NETRALISASI SEED FEED & PERLINDUNGAN ALARM AKURASI', async (t) => {
  await t.test('1. computeQuantEngine menetralkan feed sintetis LOCAL_SEED', () => {
    assert.ok(appJs.includes("if (!feedReal || isFeedEstimate || feedSource === 'LOCAL_SEED')"));
    assert.ok(appJs.includes("a.convictionScore = 50;"));
    assert.ok(appJs.includes("a.signalEligible = false;"));
  });

  await t.test('2. Tidak ada jalur penulisan radar; alarm tetap menolak feed seed lokal', () => {
    assert.ok(appJs.includes("analysis.feedSource === 'LOCAL_SEED'") || appJs.includes("analysis.source === 'LOCAL_SEED'"));
    assert.ok(appJs.includes('function writeBackRadarPools() {\n  return;\n}'));
  });

  await t.test('3. checkSignalAlarm memeriksa status pasar dan kompatibilitas harga', () => {
    assert.ok(appJs.includes("if (!isAssetMarketOpen(sym)) return;"));
    assert.ok(appJs.includes("isPriceCompatibleWithSymbol(lastP, sym)"));
  });
});

test('KALIBRASI HARGA REALISTIS (XAU/USD & RAY/USDT) & ANTI-FAKE OUTCOME', async (t) => {
  const edgeAnalyze = fs.readFileSync(path.join(root, 'functions', 'api', 'market', 'analyze.js'), 'utf-8');
  const quantCore = fs.readFileSync(path.join(root, 'functions', 'lib', 'quant-core.js'), 'utf-8');
  const sharedQuantCore = fs.readFileSync(path.join(root, 'public', 'js', 'shared', 'quant-core.js'), 'utf-8');

  await t.test('1. Kalibrasi harga spot emas XAU/USD dan RAY/USDT sesuai kuotasi pasar nyata', () => {
    assert.ok(!appJs.includes("'XAU/USD': 4055"), 'app.js tidak boleh memakai harga seed usang 4055');
    assert.ok(!edgeAnalyze.includes("'XAU/USD': 4055"), 'edge analyze tidak boleh memakai harga usang 4055');
    assert.ok(!quantCore.includes("symbol: 'XAU/USD', name: 'Gold Spot / US Dollar', assetClass: 'METALS', subGroup: 'PRECIOUS', binanceSymbol: 'PAXGUSDT', yahooSymbol: 'GC=F', basePrice: 4055"), 'quant-core tidak boleh 4055');

    assert.ok(appJs.includes("'XAU/USD': 2680"), 'app.js REFERENCE_PRICES XAU/USD harus terkalibrasi ~2680');
    assert.ok(edgeAnalyze.includes("'XAU/USD': 2680"), 'edge analyze DEFAULT_PRICES XAU/USD harus terkalibrasi ~2680');
    assert.ok(edgeAnalyze.includes("'RAY/USDT': 1.35"), 'RAY/USDT edge DEFAULT_PRICES harus terkalibrasi ~1.35 (bukan 5.2)');
    assert.ok(appJs.includes("'RAY/USDT': 1.35"), 'RAY/USDT app.js REFERENCE_PRICES harus terkalibrasi ~1.35');
    assert.ok(sharedQuantCore.includes("mkCrypto('RAY', 'Raydium Solana DEX', 1.35)"), 'RAY di quant-core harus terkalibrasi ~1.35');
  });

  await t.test('2. signalCooldownActive mengunci cooldown pasca TP_HIT untuk mencegah lock ganda instan', () => {
    assert.ok(appJs.includes("o.status === 'TP_HIT'"), 'signalCooldownActive harus mencakup TP_HIT');
    assert.ok(appJs.includes("o.status === 'MISSED'"), 'signalCooldownActive harus mencakup MISSED');
  });

  await t.test('3. notifySlPlusTriggered menolak mengirim notifikasi SL+ jika order belum filled atau trade sudah selesai', () => {
    assert.ok(appJs.includes("if (!lock.filled) return;"), 'SL+ dilarang kirim jika lock belum filled');
    assert.ok(appJs.includes("oc.status === 'TP_HIT'") && appJs.includes("notifySlPlusTriggered"), 'SL+ dilarang kirim jika trade sudah pernah TP_HIT');
  });

  await t.test('4. recordSignalOutcome mencegah order limit unfilled dicatat sebagai TP_HIT', () => {
    assert.ok(appJs.includes("if (lock && !lock.filled && (oc === 'TP_HIT' || oc === 'SL_HIT'))"), 'Unfilled limit order harus dikonversi ke MISSED / CANCELLED');
  });

  await t.test('5. reconcileSignalOutcome bebas dari ReferenceError low/high yang tidak terdefinisi', () => {
    assert.ok(!appJs.includes("var filled = L.filled === true || (isLong ? low <= entry : high >= entry);"), 'reconcileSignalOutcome tidak boleh mereferensikan low/high di luar scope');
    assert.ok(appJs.includes("var filled = L.filled === true;"), 'reconcileSignalOutcome harus menginisialisasi filled dari L.filled');
  });

  await t.test('6. feedIsReal menolak string kosong atau tanda hubung dash', () => {
    assert.ok(appJs.includes("s !== '-'"), 'feedIsReal harus menolak simbol -');
  });

  await t.test('7. Proteksi jurnal menjaga status cooldown / expired tanpa membuat ulang radar', () => {
    assert.ok(appJs.includes("key: 'COOLDOWN'"), 'evaluateSignalViability harus menangani status COOLDOWN');
    assert.ok(appJs.includes("key: 'EXPIRED'"), 'evaluateSignalViability harus menangani status EXPIRED');
    assert.ok(appJs.includes('function writeBackRadarPools() {\n  return;\n}'), 'Penulisan otomatis ke radar harus tetap dinonaktifkan');
    assert.ok(appJs.includes("staleUnfilled"), 'auditAndCleanseCorruptedStorage harus membersihkan limit order usang');
  });
});
