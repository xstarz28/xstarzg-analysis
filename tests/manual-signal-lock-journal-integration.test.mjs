import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as QC from '../public/js/shared/quant-core.js';
import * as SE from '../public/js/shared/signal-engine.js';
import { onRequestGet, onRequestPost } from '../functions/api/market/journal-sync.js';
import { signJwt } from '../functions/lib/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

function extractBlock(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  assert.ok(s >= 0, `Marker not found: ${startMarker}`);
  const e = src.indexOf(endMarker, s);
  assert.ok(e > s, `End marker not found after ${startMarker}: ${endMarker}`);
  return src.slice(s, e);
}

function createJournalRuntime({ email = 'sevenfoldarmy2822@gmail.com', token = '', env = {} } = {}) {
  const storageMap = new Map();
  const localStorage = {
    get length() { return storageMap.size; },
    key(idx) { return Array.from(storageMap.keys())[idx] || null; },
    getItem(k) { return storageMap.has(k) ? storageMap.get(k) : null; },
    setItem(k, v) { storageMap.set(String(k), String(v)); },
    removeItem(k) { storageMap.delete(k); },
    clear() { storageMap.clear(); }
  };

  const cloudCalls = [];
  let pendingCloudSaves = [];

  const fetchImpl = async (url, init = {}) => {
    const endpoint = 'https://example.test/api/market/journal-sync';
    if (String(url).includes('/api/market/journal-sync')) {
      const method = (init.method || 'GET').toUpperCase();
      const req = new Request(endpoint, {
        method,
        headers: init.headers || {},
        body: init.body
      });
      const res = method === 'POST'
        ? await onRequestPost({ request: req, env })
        : await onRequestGet({ request: req, env });
      cloudCalls.push({ method, status: res.status, body: init.body ? JSON.parse(init.body) : null });
      return res;
    }
    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  const lockStorageBlock = extractBlock(
    appJs,
    'var SIGNAL_LOCK_KEY = \'xstarzg_siglock_v3\';',
    'function notifySignalOutcomeTelegram('
  );
  const outcomeTailBlock = extractBlock(
    appJs,
    'function signalCooldownActive(symbol, tf) {',
    'function auditAndCleanseCorruptedStorage()'
  );
  const computeBlock = extractBlock(
    appJs,
    'function computeQuantEngine(candles, symbol, tf, forceRecalc, lockScope, feedSource) {',
    '/* Fallback ringan (self-contained) jika shared module belum termuat */'
  );
  const feedHelpersBlock = extractBlock(
    appJs,
    'function feedIsEstimate(src) {',
    'var INVESTOR_TFS ='
  );

  const state = {
    user: email ? { email, authToken: token, tier: 'VIP' } : null,
    mode: 'trader',
    subMode: 'futures',
    symbol: 'SOL/USDT',
    tf: 'M5',
    timeframe: 'M5',
    feedSource: 'BINANCE',
    manualInstrumentSelection: false
  };

  const factory = new Function(
    'SE',
    'localStorage',
    'fetch',
    'state',
    'trackPromise',
    `
      var RADAR_ACC_KEY = 'xstarzg_radaracc_v1';
      function num(v, d) { var n = Number(v); return Number.isFinite(n) ? n : (d !== undefined ? d : 0); }
      function radarAccStore() { return {}; }
      function ensureAuthToken() {
        return Promise.resolve(state.user && (state.user.ownerToken || state.user.authToken) || '');
      }
      function isPriceCompatibleWithSymbol(price, sym) {
        var p = Number(price);
        return Number.isFinite(p) && p > 0;
      }
      function isAssetMarketOpen() { return true; }
      function reconcileSignalOutcome() {}
      function recordSignalOutcome() {}
      function notifySlPlusTriggered() {}
      function checkTelegramHighScoreSignal() {}
      function renderSignalJournal() {}
      function computeQuickAnalysis(candles, symbol, tf) {
        return { symbol: symbol, timeframe: tf, direction: 'NEUTRAL', action: 'WAIT', signalEligible: false, confluenceScore: 50 };
      }
      ${feedHelpersBlock}
      ${lockStorageBlock}
      ${outcomeTailBlock}
      var _origSaveSignalLock = saveSignalLock;
      saveSignalLock = function(symbol, tf, lock) {
        var p = _origSaveSignalLock(symbol, tf, lock);
        if (p && typeof p.then === 'function') trackPromise(p);
        return p;
      };
      ${computeBlock}
      return {
        state,
        journalStorageKey,
        signalLockStore,
        signalLockId,
        getSignalLock,
        saveSignalLock,
        syncCloudSignalJournal,
        buildManualJournalAnalysisSnapshot,
        journalAdmission,
        computeQuantEngine,
        feedIsReal,
        feedIsEstimate
      };
    `
  );

  const api = factory(SE, localStorage, fetchImpl, state, (p) => { pendingCloudSaves.push(p); });

  async function flushCloud() {
    const batch = pendingCloudSaves.splice(0, pendingCloudSaves.length);
    await Promise.all(batch);
  }

  return {
    ...api,
    localStorage,
    storageMap,
    cloudCalls,
    flushCloud
  };
}

function makeBullishInstitutionalCandles(base = 180, step = 300) {
  const anchor = 1732456800; // London + NY overlap
  const bars = [];
  let p = base;
  for (let i = 0; i < 300; i++) {
    const t = anchor - (300 - i) * step;
    const cycle = i % 24;
    let delta;
    if (i < 245) {
      delta = cycle < 7 ? -0.9 : 1.05;
    } else if (i < 268) {
      delta = cycle < 5 ? -0.6 : 1.35;
    } else if (i < 292) {
      delta = -0.85;
    } else if (i === 292) {
      const open = p;
      const close = p + 1.4;
      bars.push({ time: t, open, high: close + 0.5, low: open - 3.8, close, volume: 4200 });
      p = close;
      continue;
    } else {
      delta = 1.15;
    }
    const open = p;
    const close = p + delta;
    const high = delta > 0 ? close + 0.35 : open + 0.45;
    const low = delta > 0 ? open - 0.25 : close - 0.45;
    const volume = i >= 293 ? 3800 : (delta > 0 ? 2200 : 900);
    bars.push({ time: t, open, high, low, close, volume });
    p = close;
  }
  return bars;
}

function createMockD1() {
  const rows = new Map();
  const tombstones = new Map();
  return {
    rows,
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      const makeRunner = (args = []) => ({
        async run() {
          if (/CREATE TABLE|ALTER TABLE|UPDATE cloud_signal_locks SET channel = 'sentinel'/i.test(normalized)) {
            return { meta: { changes: 0 } };
          }
          if (/INSERT INTO cloud_journal_tombstones/i.test(normalized)) {
            tombstones.set(args[0], Number(args[1]));
            return { meta: { changes: 1 } };
          }
          if (/DELETE FROM cloud_signal_locks WHERE channel = \?1 AND owner_email = \?2/i.test(normalized)) {
            let changes = 0;
            for (const [id, row] of rows.entries()) {
              if (row.channel === args[0] && row.owner_email === args[1]) {
                rows.delete(id);
                changes++;
              }
            }
            return { meta: { changes } };
          }
          if (/INSERT INTO cloud_signal_locks/i.test(normalized)) {
            const [
              id, symbol, tf, direction, entry, sl, tp1, tp2, tp3, sl_plus,
              be_plus_active, filled, score, issued_at, payload, owner_email, channel
            ] = args;
            rows.set(id, {
              id, symbol, tf, direction, entry, sl, tp1, tp2, tp3, sl_plus,
              be_plus_active, filled, score, status: 'ACTIVE',
              issued_at, payload, owner_email, channel,
              outcome_status: null, outcome_reason: null, outcome_at: null
            });
            return { meta: { changes: 1 } };
          }
          if (/UPDATE cloud_signal_locks SET status = 'EXPIRED'/i.test(normalized)) {
            return { meta: { changes: 0 } };
          }
          return { meta: { changes: 0 } };
        },
        async first() {
          if (/SELECT cleared_at FROM cloud_journal_tombstones/i.test(normalized)) {
            const email = args[0];
            return tombstones.has(email) ? { cleared_at: tombstones.get(email) } : null;
          }
          return null;
        },
        async all() {
          if (/SELECT \* FROM cloud_signal_locks/i.test(normalized) && /status = 'ACTIVE'/i.test(normalized)) {
            const channel = args[0];
            const ownerEmail = args[1];
            const threshold = Number(args[2] || 0);
            const results = Array.from(rows.values()).filter(r =>
              r.channel === channel && r.owner_email === ownerEmail &&
              r.status === 'ACTIVE' && Number(r.issued_at) >= threshold
            );
            return { results };
          }
          if (/SELECT \* FROM cloud_signal_locks/i.test(normalized) && /status != 'ACTIVE'/i.test(normalized)) {
            return { results: [] };
          }
          return { results: [] };
        }
      });
      return {
        ...makeRunner([]),
        bind(...args) { return makeRunner(args); }
      };
    }
  };
}

test('INTEGRASI AKTUAL PEMBUATAN SIGNAL LOCK MANUAL KE JURNAL LOKAL & CLOUD', async (t) => {
  await t.test('1. Jalur manual LONG yang lolos seluruh gerbang membuat Signal Lock dengan snapshot analysis valid dan tersimpan ke lokal & cloud (memory + D1)', async () => {
    const email = 'trader-long-e2e@example.test';
    const token = await signJwt({ email, role: 'user', tier: 'VIP' });
    const mockDb = createMockD1();

    for (const modeLabel of ['memory', 'd1']) {
      const env = modeLabel === 'd1' ? { DB: mockDb } : {};
      const rt = createJournalRuntime({ email: `${modeLabel}-${email}`, token: await signJwt({ email: `${modeLabel}-${email}`, role: 'user', tier: 'VIP' }), env });
      rt.state.symbol = 'SOL/USDT';
      rt.state.tf = 'M5';
      rt.state.timeframe = 'M5';
      rt.state.mode = 'trader';
      rt.state.subMode = 'futures';
      rt.state.feedSource = 'BINANCE';
      rt.state.manualInstrumentSelection = true;

      const candles = makeBullishInstitutionalCandles(180, 300);
      const analysis = rt.computeQuantEngine(candles, 'SOL/USDT', 'M5', true, 'create', 'BINANCE');
      await rt.flushCloud();

      assert.equal(analysis.direction, 'LONG');
      assert.equal(analysis.signalEligible, true);
      assert.equal(analysis.htfLtfAligned, true);
      assert.equal(analysis.topDown.alignmentStatus, 'ALIGNED_BULLISH');
      assert.equal(analysis.manualSelection, true);
      assert.ok(analysis.confluenceScore >= 80, `Expected score >= 80, got ${analysis.confluenceScore}`);
      assert.equal(analysis.lockedSignal, true, 'Analysis must immediately apply the newly created Signal Lock');

      // Verifikasi penyimpanan lokal
      const localLock = rt.getSignalLock('SOL/USDT', 'M5');
      assert.ok(localLock, `[${modeLabel}] Lock harus tersimpan di localStorage`);
      assert.ok(localLock.analysis, `[${modeLabel}] Lock harus membawa snapshot lock.analysis`);
      assert.equal(localLock.analysis.manualSelection, true);
      assert.equal(localLock.analysis.htfLtfAligned, true);
      assert.equal(localLock.analysis.topDown.alignmentStatus, 'ALIGNED_BULLISH');
      assert.equal(localLock.analysis.direction, 'LONG');
      assert.equal(localLock.analysis.action, 'BUY');
      assert.equal(localLock.analysis.feedSource, 'BINANCE');
      assert.equal(localLock.analysis.spotOnly, false);
      assert.equal('candles' in localLock.analysis, false, 'Snapshot tidak boleh menyimpan array candles mentah');
      assert.equal('series' in localLock.analysis, false, 'Snapshot tidak boleh menyimpan series indikator berat');

      // Verifikasi penyimpanan cloud HTTP 200
      assert.equal(rt.cloudCalls.length, 1, `[${modeLabel}] Harus mengirim 1 POST save_lock ke cloud`);
      assert.equal(rt.cloudCalls[0].method, 'POST');
      assert.equal(rt.cloudCalls[0].status, 200);

      // Simulasikan browser baru: kosongkan localStorage lalu pulihkan dari cloud
      rt.localStorage.clear();
      assert.equal(rt.getSignalLock('SOL/USDT', 'M5'), null);
      await rt.syncCloudSignalJournal();

      const restored = rt.getSignalLock('SOL/USDT', 'M5');
      assert.ok(restored, `[${modeLabel}] Lock harus berhasil dipulihkan dari cloud journal`);
      assert.equal(restored.symbol, 'SOL/USDT');
      assert.equal(restored.tf, 'M5');
      assert.equal(restored.direction, 'LONG');
      assert.equal(restored.analysis.manualSelection, true);
      assert.equal(restored.analysis.htfLtfAligned, true);
      assert.equal(restored.analysis.topDown.alignmentStatus, 'ALIGNED_BULLISH');
    }
  });

  await t.test('2. Jalur manual SHORT (ALIGNED_BEARISH) tersimpan di Futures namun ditolak tegas pada Spot & Investor (LONG-only)', async () => {
    const email = 'trader-short-e2e@example.test';
    const token = await signJwt({ email, role: 'user', tier: 'VIP' });
    const rt = createJournalRuntime({ email, token, env: {} });
    const bearishCandles = QC.generateInstitutionalSeries('BNB/USDT', 'M30', 300);

    // 2a. Trader Spot (1-arah LONG-only): SHORT dilarang membuat lock
    rt.state.symbol = 'BNB/USDT';
    rt.state.tf = 'M30';
    rt.state.timeframe = 'M30';
    rt.state.mode = 'trader';
    rt.state.subMode = 'spot';
    rt.state.feedSource = 'BINANCE';
    rt.state.manualInstrumentSelection = true;

    const spotAnalysis = rt.computeQuantEngine(bearishCandles, 'BNB/USDT', 'M30', true, 'create', 'BINANCE');
    await rt.flushCloud();
    assert.equal(spotAnalysis.spotOnly, true);
    assert.notEqual(spotAnalysis.direction, 'SHORT', 'Mode Spot tidak boleh menerbitkan arah SHORT');
    assert.equal(rt.getSignalLock('BNB/USDT', 'M30'), null);
    assert.equal(rt.cloudCalls.length, 0);

    // 2b. Investor Mode (Spot DCA LONG-only): tidak boleh menerbitkan SHORT ataupun mengisi jurnal Trader
    rt.state.mode = 'investor';
    rt.state.subMode = 'spot';
    const invAnalysis = rt.computeQuantEngine(bearishCandles, 'BNB/USDT', 'M30', true, 'create', 'BINANCE');
    await rt.flushCloud();
    assert.equal(invAnalysis.spotOnly, true);
    assert.notEqual(invAnalysis.direction, 'SHORT');
    assert.equal(rt.getSignalLock('BNB/USDT', 'M30'), null);
    assert.equal(rt.cloudCalls.length, 0);

    // 2c. Trader Futures (2-arah): setup SHORT yang lolos gerbang otomatis membuat lock & tersimpan ke lokal + cloud
    rt.state.mode = 'trader';
    rt.state.subMode = 'futures';
    const futAnalysis = rt.computeQuantEngine(bearishCandles, 'BNB/USDT', 'M30', true, 'create', 'BINANCE');
    await rt.flushCloud();

    assert.equal(futAnalysis.direction, 'SHORT');
    assert.equal(futAnalysis.signalEligible, true);
    assert.equal(futAnalysis.htfLtfAligned, true);
    assert.equal(futAnalysis.topDown.alignmentStatus, 'ALIGNED_BEARISH');
    assert.ok(futAnalysis.confluenceScore >= 80);

    const shortLock = rt.getSignalLock('BNB/USDT', 'M30');
    assert.ok(shortLock && shortLock.analysis);
    assert.equal(shortLock.direction, 'SHORT');
    assert.equal(shortLock.analysis.direction, 'SHORT');
    assert.equal(shortLock.analysis.action, 'SELL');
    assert.equal(shortLock.analysis.htfLtfAligned, true);
    assert.equal(shortLock.analysis.topDown.alignmentStatus, 'ALIGNED_BEARISH');
    assert.equal(shortLock.analysis.manualSelection, true);
    assert.equal(rt.cloudCalls.length, 1);
    assert.equal(rt.cloudCalls[0].status, 200);

    // 2d. Upaya injeksi langsung lock SHORT pada mode investor / spot ditolak di engine, lokal, dan backend (422)
    assert.equal(SE.createSignalLock({ ...futAnalysis, mode: 'investor' }, 'BNB/USDT', 'investor', 'spot'), null);
    assert.equal(SE.createSignalLock(futAnalysis, 'BNB/USDT', 'trader', 'spot'), null);

    const forgedInvestorShort = {
      ...shortLock,
      symbol: 'ETH/USDT',
      analysis: { ...shortLock.analysis, symbol: 'ETH/USDT', mode: 'investor', direction: 'SHORT' }
    };
    assert.equal(rt.journalAdmission(forgedInvestorShort.analysis, 'ETH/USDT', 'M30'), false);
    const resInvShort = await onRequestPost({
      request: new Request('https://example.test/api/market/journal-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'save_lock', lock: forgedInvestorShort })
      }),
      env: {}
    });
    assert.equal(resInvShort.status, 422);

    const forgedSpotShort = {
      ...shortLock,
      symbol: 'ETH/USDT',
      subMode: 'spot',
      analysis: { ...shortLock.analysis, symbol: 'ETH/USDT', spotOnly: true, subMode: 'spot', direction: 'SHORT' }
    };
    assert.equal(rt.journalAdmission(forgedSpotShort.analysis, 'ETH/USDT', 'M30'), false);
    const resSpotShort = await onRequestPost({
      request: new Request('https://example.test/api/market/journal-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'save_lock', lock: forgedSpotShort })
      }),
      env: {}
    });
    assert.equal(resSpotShort.status, 422);
  });

  await t.test('3. manualSelection hanya aktif pada jalur manual yang sah; jalur non-manual & lock tanpa analysis ditolak', async () => {
    const email = 'manual-guard@example.test';
    const token = await signJwt({ email, role: 'user', tier: 'VIP' });
    const rt = createJournalRuntime({ email, token, env: {} });
    const candles = makeBullishInstitutionalCandles(180, 300);

    rt.state.symbol = 'SOL/USDT';
    rt.state.tf = 'M5';
    rt.state.timeframe = 'M5';
    rt.state.feedSource = 'BINANCE';

    // 3a. Belum memilih instrumen secara manual (manualInstrumentSelection === false)
    rt.state.manualInstrumentSelection = false;
    const autoPath = rt.computeQuantEngine(candles, 'SOL/USDT', 'M5', true, 'create', 'BINANCE');
    await rt.flushCloud();
    assert.equal(autoPath.manualSelection, false);
    assert.equal(rt.getSignalLock('SOL/USDT', 'M5'), null);
    assert.equal(rt.cloudCalls.length, 0);

    // 3b. Scope 'apply' (bukan 'create') meskipun manualInstrumentSelection === true
    rt.state.manualInstrumentSelection = true;
    const applyScope = rt.computeQuantEngine(candles, 'SOL/USDT', 'M5', false, 'apply', 'BINANCE');
    await rt.flushCloud();
    assert.equal(applyScope.manualSelection, false);
    assert.equal(rt.getSignalLock('SOL/USDT', 'M5'), null);
    assert.equal(rt.cloudCalls.length, 0);

    // 3c. Simbol berbeda dari state.symbol aktif
    const otherSym = rt.computeQuantEngine(candles, 'AVAX/USDT', 'M5', false, 'create', 'BINANCE');
    await rt.flushCloud();
    assert.equal(otherSym.manualSelection, false);
    assert.equal(rt.getSignalLock('AVAX/USDT', 'M5'), null);
    assert.equal(rt.cloudCalls.length, 0);

    // 3d. SE.createSignalLock tidak memalsukan manualSelection ketika input bukan jalur manual
    const rawEngineLock = SE.createSignalLock(applyScope, 'SOL/USDT', 'trader', 'futures');
    assert.ok(rawEngineLock && rawEngineLock.analysis);
    assert.equal(rawEngineLock.analysis.manualSelection, false);
    rt.saveSignalLock('SOL/USDT', 'M5', rawEngineLock);
    await rt.flushCloud();
    assert.equal(rt.getSignalLock('SOL/USDT', 'M5'), null, 'saveSignalLock wajib menolak manualSelection: false');
    assert.equal(rt.cloudCalls.length, 0);

    // 3e. Lock tanpa objek analysis ditolak saveSignalLock & ditolak backend (422)
    const lockWithoutAnalysis = { ...rawEngineLock };
    delete lockWithoutAnalysis.analysis;
    rt.saveSignalLock('SOL/USDT', 'M5', lockWithoutAnalysis);
    await rt.flushCloud();
    assert.equal(rt.getSignalLock('SOL/USDT', 'M5'), null);

    const resNoAnalysis = await onRequestPost({
      request: new Request('https://example.test/api/market/journal-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'save_lock', lock: lockWithoutAnalysis })
      }),
      env: {}
    });
    assert.equal(resNoAnalysis.status, 422);
  });

  await t.test('4. WAIT ZONE / NO-TRADE ZONE / WAITING_ALIGNMENT dilarang keras masuk jurnal lokal maupun cloud', async () => {
    const email = 'waitzone-guard@example.test';
    const token = await signJwt({ email, role: 'user', tier: 'VIP' });
    const rt = createJournalRuntime({ email, token, env: {} });

    rt.state.symbol = 'BTC/USDT';
    rt.state.tf = 'H1';
    rt.state.timeframe = 'H1';
    rt.state.feedSource = 'BINANCE';
    rt.state.manualInstrumentSelection = true;

    // 4a. Candle nyata yang menghasilkan WAIT / WAITING_ALIGNMENT pada jalur manual
    const waitCandles = QC.generateInstitutionalSeries('BTC/USDT', 'H1', 300);
    const waitAnalysis = rt.computeQuantEngine(waitCandles, 'BTC/USDT', 'H1', true, 'create', 'BINANCE');
    await rt.flushCloud();

    assert.equal(waitAnalysis.direction, 'NEUTRAL');
    assert.equal(waitAnalysis.action, 'WAIT');
    assert.equal(waitAnalysis.signalEligible, false);
    assert.equal(waitAnalysis.htfLtfAligned, false);
    assert.equal(rt.getSignalLock('BTC/USDT', 'H1'), null);
    assert.equal(rt.cloudCalls.length, 0);

    // 4b. Segala variasi label WAIT ZONE ditolak oleh createSignalLock, journalAdmission, saveSignalLock, dan backend
    for (const blockedAction of ['WAIT', 'WAIT ZONE', 'WAIT_ZONE', '◆ WAIT / NO-TRADE ZONE', 'TUNGGU', 'NEUTRAL', 'UNALIGNED', 'HOLD / WAIT VALUE']) {
      const forged = {
        symbol: 'BTC/USDT',
        timeframe: 'H1',
        mode: 'trader',
        subMode: 'futures',
        direction: 'LONG',
        action: blockedAction,
        label: blockedAction,
        signalEligible: true,
        confluenceScore: 90,
        convictionScore: 90,
        htfLtfAligned: true,
        topDown: { isAligned: true, alignmentStatus: 'ALIGNED_BULLISH' },
        manualSelection: true,
        feedSource: 'BINANCE',
        source: 'BINANCE',
        levels: { entry: 65000, sl: 64000, tp1: 67000, tp2: 68500, tp3: 70000, rrRatio: 2.0 }
      };
      assert.equal(SE.createSignalLock(forged, 'BTC/USDT', 'trader', 'futures'), null, `createSignalLock harus menolak "${blockedAction}"`);
      assert.equal(rt.journalAdmission(forged, 'BTC/USDT', 'H1'), false, `journalAdmission harus menolak "${blockedAction}"`);
      rt.saveSignalLock('BTC/USDT', 'H1', { symbol: 'BTC/USDT', tf: 'H1', direction: 'LONG', entry: 65000, sl: 64000, tp1: 67000, score: 90, analysis: forged });
      assert.equal(rt.getSignalLock('BTC/USDT', 'H1'), null);

      const res = await onRequestPost({
        request: new Request('https://example.test/api/market/journal-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            action: 'save_lock',
            lock: { symbol: 'BTC/USDT', tf: 'H1', direction: 'LONG', entry: 65000, sl: 64000, tp1: 67000, score: 90, analysis: forged }
          })
        }),
        env: {}
      });
      assert.equal(res.status, 422, `Backend wajib menolak "${blockedAction}" dengan 422`);
    }
  });

  await t.test('5. Ketidakselarasan htfLtfAligned / alignmentStatus / arah, skor di bawah ambang, dan feed tidak terverifikasi ditolak penuh; update fill/SL+ tetap tersinkron', async () => {
    const email = 'alignment-provenance@example.test';
    const token = await signJwt({ email, role: 'user', tier: 'VIP' });
    const rt = createJournalRuntime({ email, token, env: {} });

    const baseValid = {
      symbol: 'SOL/USDT',
      timeframe: 'M5',
      mode: 'trader',
      subMode: 'futures',
      spotOnly: false,
      direction: 'LONG',
      action: 'BUY',
      signalEligible: true,
      signalTier: 'PRO',
      confluenceScore: 85,
      convictionScore: 85,
      htfLtfAligned: true,
      topDown: { isAligned: true, alignmentStatus: 'ALIGNED_BULLISH' },
      manualSelection: true,
      feedSource: 'BINANCE',
      source: 'BINANCE',
      feedUnverified: false,
      __estFeed: false
    };

    const invalidCases = [
      { name: 'LONG vs ALIGNED_BEARISH', patch: { direction: 'LONG', topDown: { isAligned: true, alignmentStatus: 'ALIGNED_BEARISH' }, htfLtfAligned: true } },
      { name: 'SHORT vs ALIGNED_BULLISH', patch: { direction: 'SHORT', action: 'SELL', topDown: { isAligned: true, alignmentStatus: 'ALIGNED_BULLISH' }, htfLtfAligned: true } },
      { name: 'htfLtfAligned false', patch: { htfLtfAligned: false } },
      { name: 'WAITING_ALIGNMENT', patch: { topDown: { isAligned: false, alignmentStatus: 'WAITING_ALIGNMENT' }, htfLtfAligned: true } },
      { name: 'Skor < 78', patch: { confluenceScore: 77, convictionScore: 77 }, lockScore: 77 },
      { name: 'Feed LOCAL_SEED', patch: { feedSource: 'LOCAL_SEED', source: 'LOCAL_SEED' } },
      { name: 'Feed EST_ANCHORED', patch: { feedSource: 'EST_ANCHORED:BINANCE', source: 'EST_ANCHORED:BINANCE' } },
      { name: 'Feed kosong / dash', patch: { feedSource: '-', source: '-' } },
      { name: 'feedUnverified true', patch: { feedUnverified: true } },
      { name: '__estFeed true', patch: { __estFeed: true } }
    ];

    for (const c of invalidCases) {
      const analysis = { ...baseValid, ...c.patch };
      assert.equal(rt.journalAdmission(analysis, 'SOL/USDT', 'M5'), false, `Lokal harus menolak kasus: ${c.name}`);
      const res = await onRequestPost({
        request: new Request('https://example.test/api/market/journal-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            action: 'save_lock',
            lock: {
              symbol: 'SOL/USDT',
              tf: 'M5',
              direction: analysis.direction,
              entry: 180,
              sl: 175,
              tp1: 190,
              score: c.lockScore ?? 85,
              analysis
            }
          })
        }),
        env: {}
      });
      assert.equal(res.status, 422, `Backend harus menolak kasus: ${c.name}`);
    }

    // Feed LOCAL_SEED pada jalur manual dinetralkan dan tidak membuat lock
    rt.state.symbol = 'SOL/USDT';
    rt.state.tf = 'M5';
    rt.state.timeframe = 'M5';
    rt.state.manualInstrumentSelection = true;
    const candles = makeBullishInstitutionalCandles(180, 300);
    const seedRun = rt.computeQuantEngine(candles, 'SOL/USDT', 'M5', true, 'create', 'LOCAL_SEED');
    await rt.flushCloud();
    assert.equal(seedRun.feedUnverified, true);
    assert.equal(seedRun.manualSelection, false);
    assert.equal(seedRun.htfLtfAligned, false);
    assert.equal(rt.getSignalLock('SOL/USDT', 'M5'), null);

    // Setelah feed nyata tiba, lock terbit dan saat candle berikutnya mengisi order + memicu SL+,
    // pembaruan lock tetap lolos validasi lokal & cloud karena lock.analysis ikut dipertahankan.
    rt.state.feedSource = 'BINANCE';
    rt.computeQuantEngine(candles, 'SOL/USDT', 'M5', true, 'create', 'BINANCE');
    await rt.flushCloud();
    const createdLock = rt.getSignalLock('SOL/USDT', 'M5');
    assert.ok(createdLock && createdLock.analysis);

    const entry = Number(createdLock.entry);
    const tp1 = Number(createdLock.tp1);
    const lastClosed = candles[candles.length - 1];
    const rallyPrice = entry + (tp1 - entry) * 0.45;
    const nextCandles = candles.concat([
      // Closed bar 1: pullback mengisi entry limit lalu naik melampaui ambang BE+ (30% ke TP1)
      { time: lastClosed.time + 300, open: lastClosed.close, high: rallyPrice, low: entry - 0.05, close: rallyPrice, volume: 3500 },
      // Forming bar saat ini (akan di-trim oleh trimClosedCandles)
      { time: lastClosed.time + 600, open: rallyPrice, high: rallyPrice + 0.1, low: rallyPrice - 0.1, close: rallyPrice, volume: 1200 }
    ]);

    rt.computeQuantEngine(nextCandles, 'SOL/USDT', 'M5', false, 'create', 'BINANCE');
    await rt.flushCloud();

    const updatedLock = rt.getSignalLock('SOL/USDT', 'M5');
    assert.ok(updatedLock);
    assert.equal(updatedLock.filled, true, 'Order harus terisi setelah candle baru menjemput entry');
    assert.equal(updatedLock.bePlusActive, true, 'SL+ (BE+) harus aktif setelah harga melaju >=30% menuju TP1');
    assert.ok(updatedLock.analysis && updatedLock.analysis.manualSelection === true, 'Snapshot analysis tetap utuh saat update lock');
    assert.equal(rt.cloudCalls.length, 2, 'Pembuatan awal + update fill/SL+ keduanya tersinkron ke cloud');
    assert.equal(rt.cloudCalls[1].status, 200);
  });

  await t.test('6. Ambang pembuatan baru >= 80 terjaga dan Investor Spot LONG-only tetap menerima LONG valid namun menolak SHORT', async () => {
    const email = 'score-and-investor-long@example.test';
    const token = await signJwt({ email, role: 'user', tier: 'VIP' });
    const rt = createJournalRuntime({ email, token, env: {} });

    // SOL/USDT H1 menghasilkan LONG PRO dengan skor 78 (< 80 ambang penerbitan otomatis computeQuantEngine)
    rt.state.symbol = 'SOL/USDT';
    rt.state.tf = 'H1';
    rt.state.timeframe = 'H1';
    rt.state.mode = 'trader';
    rt.state.subMode = 'futures';
    rt.state.feedSource = 'BINANCE';
    rt.state.manualInstrumentSelection = true;

    const h1Candles = makeBullishInstitutionalCandles(180, 3600);
    const h1Analysis = rt.computeQuantEngine(h1Candles, 'SOL/USDT', 'H1', true, 'create', 'BINANCE');
    await rt.flushCloud();

    assert.equal(h1Analysis.direction, 'LONG');
    assert.equal(h1Analysis.confluenceScore, 78);
    assert.equal(rt.getSignalLock('SOL/USDT', 'H1'), null, 'Skor 78 (< 80) tidak boleh otomatis menerbitkan Signal Lock baru di computeQuantEngine');
    assert.equal(rt.cloudCalls.length, 0);

    // Investor Spot LONG valid (skor >= 78, ALIGNED_BULLISH, manualSelection: true) tetap diterima kontrak admission & backend
    const validInvestorLongAnalysis = {
      symbol: 'BTC/USDT',
      timeframe: 'D1',
      mode: 'investor',
      subMode: 'spot',
      spotOnly: true,
      direction: 'LONG',
      action: 'BUY',
      signalEligible: true,
      confluenceScore: 84,
      convictionScore: 84,
      htfLtfAligned: true,
      topDown: { isAligned: true, alignmentStatus: 'ALIGNED_BULLISH' },
      manualSelection: true,
      feedSource: 'BINANCE',
      source: 'BINANCE',
      feedUnverified: false,
      __estFeed: false,
      levels: { entry: 60000, sl: 54000, tp1: 68000, tp2: 75000, tp3: 85000, rrRatio: 2.5 }
    };
    const invLongLock = SE.createSignalLock(validInvestorLongAnalysis, 'BTC/USDT', 'investor', 'spot');
    assert.ok(invLongLock && invLongLock.analysis);
    assert.equal(invLongLock.analysis.spotOnly, true);
    assert.equal(invLongLock.analysis.direction, 'LONG');
    assert.equal(rt.journalAdmission(invLongLock.analysis, 'BTC/USDT', 'D1'), true);

    const resInvLong = await onRequestPost({
      request: new Request('https://example.test/api/market/journal-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'save_lock', lock: invLongLock })
      }),
      env: {}
    });
    assert.equal(resInvLong.status, 200);
  });
});
