import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('ADAPTIVE ENTRY VIABILITY & TIME-AWARE RECOMMENDATION ENGINE', async (t) => {
  const html = fs.readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(process.cwd(), 'public/app.js'), 'utf8');

  await t.test('1. DEX UI mengharuskan pencarian manual dan tidak menampilkan scanner rekomendasi', () => {
    assert.ok(html.includes('id="memeWorkspaceWrap"'));
    assert.ok(html.includes('id="selMemeChain"'));
    assert.ok(html.includes('id="inpMemeAddress"'));
    assert.ok(html.includes('id="btnMemeSearch"'));
    assert.ok(html.includes('data-i18n="ui.memeIntro"') && html.includes('There is no automatic scanning or recommendation.'));
    assert.ok(!html.includes('id="radarViabilityBar"'));
  });

  await t.test('2. app.js menginisialisasi radarViability default ke "actionable" (Layak Ikut Saja)', () => {
    assert.ok(app.includes("radarViability: 'actionable'"), 'Default state.radarViability harus "actionable"');
    assert.ok(app.includes('function evaluateSignalViability'), 'app.js harus mendefinisikan evaluateSignalViability');
    assert.ok(app.includes('function syncRadarViabilityTabs'), 'app.js harus mendefinisikan syncRadarViabilityTabs');
  });

  await t.test('3. Logika evaluateSignalViability mengklasifikasikan status secara matematis', () => {
    // Ekstrak fungsi evaluateSignalViability dan isAssetMarketOpen dari app.js untuk dievaluasi
    const mockContext = {
      state: { mode: 'trader' },
      T: (k, def) => def,
      getSignalLock: () => null,
      num: (a, b) => Number(a != null ? a : b),
      window: { XSI18N: { getLanguage: () => 'id' } }
    };

    // Buat runner lokal evaluateSignalViability dengan konteks terisolasi
    const fnMatch = app.match(/function evaluateSignalViability\([\s\S]*?\n\}\ntry \{ window\.evaluateSignalViability/);
    assert.ok(fnMatch, 'Fungsi evaluateSignalViability harus ditemukan');
    const fnCode = fnMatch[0].replace(/try \{ window\.evaluateSignalViability[\s\S]*$/, '');

    const isMarketOpenMatch = app.match(/function isAssetMarketOpen\([\s\S]*?\n\}/);
    assert.ok(isMarketOpenMatch, 'Fungsi isAssetMarketOpen harus ditemukan');

    const evalFactory = new Function('mockCtx', `
      const state = mockCtx.state;
      const T = mockCtx.T;
      const getSignalLock = mockCtx.getSignalLock;
      const num = mockCtx.num;
      const window = mockCtx.window;
      ${isMarketOpenMatch[0]}
      ${fnCode}
      return { evaluateSignalViability, isAssetMarketOpen };
    `);

    const { evaluateSignalViability } = evalFactory(mockContext);

    // Kasus 1: FRESH - Antrean limit BUY @ 1.0978 saat harga live 1.0980 (belum terisi / dekat entry)
    const freshItem = {
      sym: 'EUR/USD',
      tf: 'H1',
      price: 1.0980,
      analysis: {
        symbol: 'EUR/USD',
        timeframe: 'H1',
        direction: 'LONG',
        lastPrice: 1.0980,
        atr: 0.0018,
        topDown: { isAligned: true, macroBias: 'BULLISH' },
        levels: { entry: 1.0978, sl: 1.0955, tp1: 1.1002, rrRatio: 2.0 }
      }
    };
    const vFresh = evaluateSignalViability(freshItem);
    assert.strictEqual(vFresh.key, 'FRESH');
    assert.strictEqual(vFresh.worth, true);
    assert.strictEqual(vFresh.priority, 1);
    assert.ok(vFresh.label.includes('SIAP ENTRY (BARU)'));

    // Kasus 2: PULLBACK - Order sudah terjemput (lock.filled = true), harga retest kembali dekat entry (1.0980), R:R masih 1.8:1
    const pullbackContext = {
      ...mockContext,
      getSignalLock: () => ({ filled: true, bePlusActive: false })
    };
    const { evaluateSignalViability: evalPullback } = evalFactory(pullbackContext);
    const vPullback = evalPullback(freshItem);
    assert.strictEqual(vPullback.key, 'PULLBACK');
    assert.strictEqual(vPullback.worth, true);
    assert.strictEqual(vPullback.priority, 2);
    assert.ok(vPullback.label.includes('BISA IKUT (PULLBACK)'));

    // Kasus 3: LATE - Sinyal sudah jalan jauh ke TP1 (harga 1.0998 dari TP1 1.1002, sudah +83% target)
    const lateItem = {
      ...freshItem,
      price: 1.0998,
      analysis: {
        ...freshItem.analysis,
        lastPrice: 1.0998
      }
    };
    const vLate = evalPullback(lateItem);
    assert.strictEqual(vLate.key, 'LATE');
    assert.strictEqual(vLate.worth, false, 'Sinyal yang sudah jalan jauh tidak boleh bernilai worth: true untuk user baru');
    assert.strictEqual(vLate.priority, 30);
    assert.ok(vLate.label.includes('JANGAN KEJAR (TERLAMBAT)'));

    // Kasus 4: NEAR_SL - Harga floating minus menembus >= 50% jarak SL (harga 1.0965, entry 1.0978, sl 1.0955)
    const nearSlItem = {
      ...freshItem,
      price: 1.0965,
      analysis: {
        ...freshItem.analysis,
        lastPrice: 1.0965
      }
    };
    const vNearSl = evalPullback(nearSlItem);
    assert.strictEqual(vNearSl.key, 'NEAR_SL');
    assert.strictEqual(vNearSl.worth, false, 'Sinyal rawan SL tidak boleh bernilai worth: true');
    assert.strictEqual(vNearSl.priority, 80);
    assert.ok(vNearSl.label.includes('RAWAN SL (JANGAN IKUT)'));
  });

  await t.test('4. renderRadarCardHtml menyematkan badge kelayakan dan styling border adaptif', () => {
    assert.ok(app.includes('var viab = evaluateSignalViability(it);'));
    assert.ok(app.includes('viabBadgeHtml'));
    assert.ok(app.includes('escH(viab.label)'));
    assert.ok(app.includes('escH(viab.sub)'));
  });

  await t.test('5. paintRadarItems menyortir sinyal layak ke urutan teratas & memfilter berdasarkan radarViability', () => {
    assert.ok(app.includes('function sortAndFilterRadarGroup'));
    assert.ok(app.includes('vx.priority - vy.priority'));
    assert.ok(app.includes("viabFilter === 'actionable'"));
    assert.ok(app.includes("viabFilter === 'fresh'"));
    assert.ok(app.includes("viabFilter === 'running'"));
    assert.ok(app.includes('actCount > 0'));
  });

  await t.test('6. syncModeButtonLabels menyesuaikan label filter kelayakan multibahasa', () => {
    assert.ok(app.includes("lblViabTitle.textContent = isEn ? 'Entry Viability Filter:' : 'Kelayakan Entry Saat Buka:';"));
    assert.ok(app.includes("btnViabAct.textContent = isEn ? '🎯 Actionable Only (Fresh & Pullback)' : '🎯 Layak Ikut Saja (Fresh & Pullback)';"));
  });

  await t.test('7. Integrasi Bot Telegram tidak terganggu: hanya sinyal baru, SL+ dan alarm', () => {
    const sentinel = fs.readFileSync(path.join(process.cwd(), 'scripts/market-sentinel.mjs'), 'utf8');
    assert.ok(sentinel.includes('SL+ TERPICU (0-RISK)'));
    assert.ok(sentinel.includes('TAKE PROFIT 1 TERCAPAI!'));
    assert.ok(app.includes('function checkTelegramHighScoreSignal'));
    assert.ok(app.includes('function checkSignalAlarm'));
  });

  await t.test('8. Proteksi Anti-Duplikasi Notifikasi Telegram: Persistensi localStorage & Guard Active Lock', () => {
    assert.ok(app.includes('xstarzg_tg_last_sent_v1'), 'Dedup key Telegram harus dipersistensikan ke localStorage xstarzg_tg_last_sent_v1');
    assert.ok(app.includes('recordTelegramSentKey'), 'Fungsi recordTelegramSentKey harus ada untuk menyimpan riwayat notifikasi');
    assert.ok(app.includes("activeLock.status === 'ACTIVE'"), 'checkTelegramHighScoreSignal harus mengecek activeLock status ACTIVE');
    assert.ok(app.includes('getSignalLock(sym, tf)'), 'checkTelegramHighScoreSignal harus memeriksa lock aktif berdasarkan symbol dan tf');
  });

  await t.test('9. Filter Radar Viability Running Setup: Menampilkan posisi aktif & journey tanpa tereliminasi actionable filter', () => {
    assert.ok(app.includes('signalLockStore'), 'paintRadarItems harus membaca signalLockStore untuk menginjeksi posisi aktif pengguna');
    assert.ok(app.includes("isUserActiveTrade"), 'Posisi aktif pengguna harus ditandai dengan isUserActiveTrade');
    assert.ok(app.includes("journeyBarHtml"), 'Kartu radar harus merender progress bar perjalanan trading journeyBarHtml');
    assert.ok(app.includes("ke TP1"), 'Progress bar perjalanan harus memuat persentase kemajuan ke TP1');
    assert.ok(app.includes("viabFilter === 'running'"), 'Harus ada penanganan khusus untuk filter viability running');
  });

});
