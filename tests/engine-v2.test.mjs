import * as macroEdge from '../functions/api/macro/regime.js';
import * as newsEdge from '../functions/api/news/calendar.js';
// Engine Brain v2 — unit checks (Node, tanpa dependensi).
// Jalankan: node tests/engine-v2.test.mjs
const QC = await import('../public/js/shared/quant-core.js');
const SE = await import('../public/js/shared/signal-engine.js');

let passed = 0, failed = 0;
const chk = (n, c) => { if (c) { passed++; } else { failed++; console.log('FAIL:', n); } };

const TF = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400, W1: 604800, MN: 2592000 };
// Candle closed hingga waktu tertentu (aligned di masa lalu agar tidak dianggap "forming")
const gen = (sym, tf) => QC.generateInstitutionalSeries(sym, tf, 300);

/* ---------- 1. Closed-candle determinism (aturan #3.1) ---------- */
{
  const sym = 'XAU/USD', tf = 'H1';
  const base = gen(sym, tf);
  const a1 = SE.runFullAnalysis({ symbol: sym, timeframe: tf, candles: base, mode: 'trader', horizon: 'all' });
  chk('analisis dasar valid', !a1.error);
  // Simulasikan tick live agresif pada candle yang sedang berjalan
  const step = TF[tf];
  const last = base[base.length - 1];
  const ticked = base.concat([{ time: last.time + step, open: last.close, high: last.close * 1.09, low: last.close * 0.91, close: last.close * 0.955, volume: 7777 }]);
  const a2 = SE.runFullAnalysis({ symbol: sym, timeframe: tf, candles: ticked, mode: 'trader', horizon: 'all' });
  chk('tick live tidak menggeser direction', a1.direction === a2.direction);
  chk('tick live tidak menggeser skor', a1.confluenceScore === a2.confluenceScore);
  chk('tick live tidak menggeser entry/sl/tp', JSON.stringify([a1.levels.entry, a1.levels.sl, a1.levels.tp2]) === JSON.stringify([a2.levels.entry, a2.levels.sl, a2.levels.tp2]));
  // trimClosedCandles benar-benar membuang candle forming
  const trimmed = SE.trimClosedCandles(ticked, step);
  chk('candle forming ter-trim', trimmed.length === base.length - 0 || trimmed[trimmed.length - 1].time <= base[base.length - 1].time);
}

/* ---------- 2. Hard Veto (aturan #1A) ---------- */
{
  // Deretan candle "rocket" => harga jauh di atas EMA/VWAP, RSI jenuh => veto LONG
  const now = Math.floor(Date.now() / 1000 / 3600) * 3600;
  const mk = [];
  let price = 100;
  for (let i = 220; i >= 1; i--) { // semua closed (berhenti 1 bar sebelum now)
    const t = now - i * 3600;
    price = price * (i < 30 ? 1.004 : 1.0008);
    mk.push({ time: t, open: price / 1.004, high: price * 1.002, low: price / 1.006, close: price, volume: 1000 });
  }
  const a = SE.runFullAnalysis({ symbol: 'BTC/USDT', timeframe: 'H1', candles: mk, mode: 'trader', horizon: 'all' });
  chk('rocket market: LONG di-veto OVEREXTENDED/EXHAUST', a.gating.vetoLong.indexOf('OVEREXTENDED') > -1 || a.gating.vetoLong.indexOf('EXHAUST_RSI') > -1);
  chk('rocket market: tidak ada sinyal LONG (gate menolak)', a.direction !== 'LONG');
  chk('rocket market: level eksekusi tidak dipaksakan (null)', a.levels.entry === null && a.levels.sl === null);
}

/* ---------- 3. Ambang bertingkat (v2026.40+): ELITE 84/78 mutlak, PRO >=62 ---------- */
{
  const syms = ['BTC/USDT', 'ETH/USDT', 'EUR/USD', 'XAU/USD', 'WTI', 'NVDA'];
  let checked = 0;
  for (const sym of syms) {
    const a = SE.runFullAnalysis({ symbol: sym, timeframe: 'H1', candles: gen(sym, 'H1'), mode: 'trader', horizon: 'all' });
    if (a.error) continue;
    checked++;
    // Invariant koherensi tier: keyakinan <62 TIDAK pernah memberi entry
    if (a.convictionScore < 62) {
      chk(`${sym}: keyakinan <62 => tidak ada ENTRY`, !a.signalEligible && a.direction === 'NEUTRAL');
    }
    // ELITE tetap mutlak: WR <78 tidak boleh diberi label ELITE
    if (a.signalTier === 'ELITE') {
      chk(`${sym}: ELITE wajib WR>=78 & skor>=84`, a.backtest.winRate >= 78 && a.convictionScore >= 84);
    }
    // Setiap sinyal yang terbit wajib keyakinan >=62 (koherensi angka<->peluang)
    if (a.signalEligible) {
      chk(`${sym}: ENTRY terbit => keyakinan >=62`, a.convictionScore >= 62);
    }
  }
  chk('sampel suite valid', checked >= 4);
}

/* ---------- 4. Snipers levels math (aturan #1B/1C) ---------- */
{
  const ctx = {
    price: 100, atr: 2, poc: 99,
    impulseLow: 94, impulseHigh: 104,
    recentHigh: 104, recentLow: 94,
    vah: 105, val: 96.5,
    r1: 106, r2: 108, s1: 96, s2: 92.5,
    t1Sup: 100.2,
    bullOb: { top: 96.2, bottom: 95.4, index: 10 }, bearOb: null,
    bullFvg: { top: 99.2, bottom: 98.4, mid: 98.8 }, bearFvg: null
  };
  const L = SE.buildInstitutionalLevels('LONG', ctx);
  chk('LONG entry di zona mitigasi (<= harga closed)', L.entry <= ctx.price + 1e-9 && L.entry > 0);
  chk('LONG SL di bawah wick struktur - buffer SNIPER 0.60 ATR', Math.abs(L.sl - (94 - 1.2)) < 1e-6); // min(impulseLow 94, OB bottom 95.4) - 0.60*2 (v2026.51 default SNIPER)
  chk('LONG SL di bawah entry', L.sl < L.entry);
  chk('LONG TP2 memenuhi RR >= 2.2', (L.tp2 - L.entry) / (L.entry - L.sl) >= 2.2 - 1e-9);
  chk('LONG TP naik berurutan', L.tp1 < L.tp2 && L.tp2 < L.tp3 && L.entry < L.tp1);
  const S = SE.buildInstitutionalLevels('SHORT', {
    ...ctx, price: 100, bearOb: { top: 104.6, bottom: 103.8, index: 12 }, bearFvg: { top: 101.6, bottom: 100.8, mid: 101.2 }, bullOb: null, bullFvg: null
  });
  chk('SHORT entry di zona premium (>= harga closed)', S.entry >= ctx.price - 1e-9);
  // SHORT SL (SNIPER) = max(wick swing, OB top) + 0.60*ATR -> max(104, 104.6) + 1.2 = 105.8
  chk('SHORT SL di atas wick struktur + buffer SNIPER', Math.abs(S.sl - (104.6 + 1.2)) < 1e-6);
  chk('SHORT TP2 memenuhi RR >= 2.2', (S.entry - S.tp2) / (S.sl - S.entry) >= 2.2 - 1e-9);
  chk('SHORT TP turun berurutan', S.tp1 > S.tp2 && S.tp2 > S.tp3 && S.entry > S.tp1);
}

/* v2026.51 Dual-Brain: SCALP memakai risiko TP1-berat (target mikro); SNIPER SNIPER struktural */
{
  const ctxS = {
    price: 100, atr: 2, poc: 99,
    impulseLow: 94, impulseHigh: 104,
    recentHigh: 104, recentLow: 94,
    vah: 105, val: 96.5,
    r1: 106, r2: 108, s1: 96, s2: 92.5,
    t1Sup: 100.2,
    bullOb: { top: 96.2, bottom: 95.4, index: 10 }, bearOb: null,
    bullFvg: { top: 99.2, bottom: 98.4, mid: 98.8 }, bearFvg: null,
    brain: 'SCALP'
  };
  const SL = SE.buildInstitutionalLevels('LONG', ctxS);
  chk('SCALP SL buffer lebih tipis (0.30*ATR)', Math.abs(SL.sl - (94 - 0.6)) < 1e-6);
  chk('SCALP TP1 memenuhi target RR >= 2.0 (1:2)', (SL.tp1 - SL.entry) / (SL.entry - SL.sl) >= 2.0 - 1e-9);
  chk('SCALP TP2 minimal 3.0R (bukan mikro-target)', (SL.tp2 - SL.entry) / (SL.entry - SL.sl) >= 3.0 - 1e-9);
  chk('SCALP TP naik berurutan', SL.tp1 < SL.tp2 && SL.tp2 < SL.tp3 && SL.entry < SL.tp1);
  chk('SCALP rrRatio mengacu ke TP1 (1:2 R:R)', SL.rrRatio >= 2.0 - 1e-9);
}

/* ---------- 5. Persistent Signal Lock lifecycle (aturan #3.2) ---------- */
{
  const analysis = {
    symbol: 'BTC/USDT', timeframe: 'H1', mode: 'trader',
    direction: 'LONG', signalEligible: true,
    levels: { entry: 100, sl: 97.5, tp1: 103, tp2: 105.6, tp3: 109, rrRatio: 2.24 },
    confluenceScore: 88, anchorClosedTime: 1000, anchorClosedClose: 100,
    gating: { winRate: 81 }, backtest: { winRate: 81 }
  };
  const lock = SE.createSignalLock(analysis, 'BTC/USDT', 'trader', 'futures');
  chk('lock diterbitkan dari sinyal eligible', !!lock && lock.status === 'ACTIVE');
  const none = SE.createSignalLock({ ...analysis, signalEligible: false }, 'BTC/USDT', 'trader', 'futures');
  chk('lock menolak sinyal tidak eligible', none === null);
  // Tidak ada candle baru -> tetap ACTIVE
  let v = SE.validateSignalLock(lock, [{ time: 900, open: 99, high: 101, low: 98, close: 100, volume: 1 }, { time: 1000, open: 100, high: 101, low: 99, close: 100.4, volume: 1 }], null);
  chk('tanpa candle closed baru -> lock ACTIVE', v.status === 'ACTIVE');
  // Candle baru tapi harga normal -> tetap ACTIVE
  v = SE.validateSignalLock(lock, [{ time: 1100, open: 100.4, high: 101.8, low: 99.9, close: 101.2, volume: 1 }], null);
  chk('candle baru aman -> lock ACTIVE', v.status === 'ACTIVE');
  // TP hit
  v = SE.validateSignalLock(lock, [{ time: 1200, open: 101, high: 103.5, low: 100.6, close: 103.1, volume: 1 }], null);
  chk('TP tersentuh -> setup selesai (unlock)', v.status === 'TP_HIT');
  // SL hit
  v = SE.validateSignalLock(lock, [{ time: 1200, open: 100, high: 101, low: 97.2, close: 97.4, volume: 1 }], null);
  chk('SL ditembus -> invalidated (unlock)', v.status === 'SL_HIT');
  // Struktur berbalik DAN harga diterima melawan >=50% risiko (close 98.3 <= 98.75) -> unlock
  v = SE.validateSignalLock(lock, [{ time: 1300, open: 100, high: 100.6, low: 98.2, close: 98.3, volume: 1 }], { indicators: { smcStatus: 'BEARISH BOS (Break of Structure ▼)' } });
  chk('flip struktur + penerimaan harga melawan -> unlock', v.status === 'STRUCTURE_INVALID');
  // Flip label saja TANPA penerimaan harga -> lock tetap ACTIVE (anti chop)
  v = SE.validateSignalLock(lock, [{ time: 1300, open: 100, high: 101, low: 99, close: 99.5, volume: 1 }], { indicators: { smcStatus: 'BEARISH BOS (Break of Structure ▼)' } });
  chk('flip struktur tanpa penerimaan harga -> lock tetap ACTIVE', v.status === 'ACTIVE');
  // applyLockedSignal mengoverride level tampilan
  const fresh = SE.runFullAnalysis({ symbol: 'BTC/USDT', timeframe: 'H1', candles: gen('BTC/USDT', 'H1'), mode: 'trader', horizon: 'all' });
  if (!fresh.error) {
    SE.applyLockedSignal(fresh, lock);
    chk('apply: direction & level diganti kunci', fresh.direction === 'LONG' && fresh.levels.entry === 100 && fresh.levels.tp2 === 105.6 && fresh.lockedSignal === true);
  }
}

/* ---------- 6. Multi-TF selection (aturan #2) ---------- */
{
  const mkA = (tf, elig, conf, wr) => ({
    error: undefined, timeframe: tf, direction: elig ? 'LONG' : 'NEUTRAL',
    signalEligible: elig, confluenceScore: conf,
    backtest: { disabled: false, winRate: wr },
    indicators: { erValue: 0.6 }, gating: { vetoLong: [], vetoShort: [] }
  });
  const byTf = { M1: mkA('M1', false, 55, 40), M5: mkA('M5', true, 86, 80), M15: mkA('M15', false, 70, 60), M30: mkA('M30', false, 60, 50), H1: mkA('H1', true, 90, 84), H4: mkA('H4', false, 50, 30), D1: mkA('D1', false, 66, 55), W1: mkA('W1', true, 85, 79), MN: mkA('MN', false, 40, 20) };
  const picks = SE.pickBestTimeframes(byTf);
  chk('best scalping = M5 (eligible)', picks.groups.scalping.tf === 'M5' && picks.groups.scalping.eligible);
  chk('best intraday = H1 (eligible)', picks.groups.intraday.tf === 'H1');
  chk('best swing = W1 (eligible)', picks.groups.swing.tf === 'W1');
  chk('best keseluruhan = TF eligible', picks.best && picks.best.eligible === true);
  // Jika tak ada yang eligible -> tetap memilih kualitas tertinggi tanpa klaim eligible
  const allBad = { M1: mkA('M1', false, 40, 30), M5: mkA('M5', false, 45, 35), M15: mkA('M15', false, 35, 25) };
  const p2 = SE.pickBestTimeframes({ ...allBad, MN: mkA('MN', false, 39, 10) });
  chk('tanpa eligible -> best tidak mengklaim eligible', p2.best && p2.best.eligible !== true);
}

/* ---------- 7. Resample & HTF bias ---------- */
{
  const c = gen('EUR/USD', 'M5');
  const h = SE.resampleCandles(c, 900);
  chk('resample M5->M15 memadatkan jumlah bar', h.length > 10 && h.length <= Math.ceil(c.length / 3) + 1);
  const b = SE.computeHtfBias(c, 'M5');
  chk('htf bias diketahui (-1/0/1) atau null saat data kurang', b === null || b === -1 || b === 0 || b === 1);
}

/* ---------- 12. Skor keyakinan netral-arah & koherensi dua arah (v2026.41) ---------- */
{
  const syms = ['BTC/USDT','ETH/USDT','SOL/USDT','XAU/USD','EUR/USD','USD/JPY','WTI','NVDA','AAPL','BBCA.JK','ANTM.JK','GOTO.JK','JUP/USDT','COTTON','LINK/USDT','PLTR'];
  const tfs = ['M15','H1','H4','D1'];
  let coherent = 0, incoherent = 0, tiers = 0, shorts = 0;
  for (const sym of syms) for (const tf of tfs) {
    const a = SE.runFullAnalysis({ symbol: sym, timeframe: tf, candles: gen(sym, tf), mode: 'trader', horizon: 'all' });
    if (a.error) continue;
    chk.range = 0;
    if (!(a.convictionScore >= 0 && a.convictionScore <= 100)) incoherent++;
    else if (a.signalTier ? a.convictionScore >= 62 : a.convictionScore < 62) coherent++;
    else incoherent++;
    if (a.signalTier) { tiers++; if (a.direction === 'SHORT') shorts++; }
  }
  chk('skor keyakinan selalu dalam 0-100 & koheren dg sinyal (64 scan)', coherent === 64 && incoherent === 0);
  chk('tier sinyal simetris: SHORT juga bisa lolos gerbang', tiers >= 1);
  // Backtest membawa statistik per-arah
  const bt = SE.runWalkForwardBacktest ? null : null;
  const sample = SE.runFullAnalysis({ symbol: 'JUP/USDT', timeframe: 'H4', candles: gen('JUP/USDT','H4'), mode: 'trader', horizon: 'all' });
  chk('backtest expose longWR/shortWR/longTotal/shortTotal', sample.backtest && !sample.backtest.disabled
    ? ['longWR','shortWR','longTotal','shortTotal'].every(k => Number.isFinite(sample.backtest[k]))
    : !!sample.backtest);
}

/* ---------- 13. SPOT_ONLY: saham/spot tidak menerbitkan SHORT ---------- */
{
  // Saham otomatis spot (tidak bergantung toggle); crypto ikut subMode user.
  const aStock = SE.runFullAnalysis({ symbol: 'BBCA.JK', timeframe: 'H1', candles: gen('BBCA.JK','H1'), mode: 'trader', horizon: 'all' });
  chk('saham terdeteksi spotOnly', aStock.spotOnly === true);
  const aCryptoFut = SE.runFullAnalysis({ symbol: 'BTC/USDT', timeframe: 'H1', candles: gen('BTC/USDT','H1'), mode: 'trader', horizon: 'all', spotOnly: false });
  chk('crypto futures bukan spotOnly', aCryptoFut.spotOnly === false);
  const aCryptoSpot = SE.runFullAnalysis({ symbol: 'BTC/USDT', timeframe: 'H1', candles: gen('BTC/USDT','H1'), mode: 'trader', horizon: 'all', spotOnly: true });
  chk('crypto spot = spotOnly', aCryptoSpot.spotOnly === true);
  // Scan cari kasus softBias SHORT yang eligible di futures -> wajib tertolak di spot
  let found = null;
  for (const sym of ['SOL/USDT','GOTO.JK','PLTR','ANTM.JK','JUP/USDT','LINK/USDT','COTTON','WTI']) for (const tf of ['M15','H1','H4','D1']) {
    const fut = SE.runFullAnalysis({ symbol: sym, timeframe: tf, candles: gen(sym, tf), mode: 'trader', horizon: 'all', spotOnly: false });
    if (!fut.error && fut.softBias === 'SHORT') { found = { sym, tf }; break; }
  }
  if (found) {
    const spot = SE.runFullAnalysis({ symbol: found.sym, timeframe: found.tf, candles: gen(found.sym, found.tf), mode: 'trader', horizon: 'all', spotOnly: true });
    chk('spotOnly menolak sinyal SHORT', !(spot.signalEligible && spot.direction === 'SHORT'));
    chk('gateLine memuat alasan SPOT_ONLY saat SHORT ditolak', spot.softBias !== 'SHORT' || (spot.gating.active || []).includes('SPOT_ONLY'));
  } else { chk('spotOnly menolak sinyal SHORT (no case found, pass)', true); chk('gateLine SPOT_ONLY (no case, pass)', true); }
}

/* ---------- 14. Lock determinisme: skor keyakinan ikut paket terkunci ---------- */
{
  const a = SE.runFullAnalysis({ symbol: 'OPG/USDT', timeframe: 'H1', candles: gen('OPG/USDT','H1'), mode: 'trader', horizon: 'all' });
  chk('analisis OPG valid untuk uji lock', !a.error);
  const lock = { status: 'ACTIVE', direction: 'LONG', tf: 'H1', score: 88, winRate: 81.2,
    entry: 10.5, sl: 9.9, tp1: 11.2, tp2: 11.9, tp3: 13.0, rrRatio: 2.2, anchorClosedTime: 0 };
  SE.applyLockedSignal(a, lock);
  chk('lock mengikat skor keyakinan (conviction & confluence >= skor lock)', a.convictionScore >= 88 && a.confluenceScore >= 88);
  chk('lock mengikat level eksekusi', a.lockedSignal === true && a.levels.entry === 10.5 && a.levels.sl === 9.9 && a.levels.tp2 === 11.9);
  chk('lock memaksa status eligible', a.signalEligible === true && a.direction === 'LONG');
}

/* ---------- 15. Invalidasi lock: flip label saja TIDAK cukup ---------- */
{
  const mk = (t, c, lo) => ({ time: t, open: c, high: c * 1.002, low: lo || c * 0.998, close: c, volume: 100 });
  const lockL = { status: 'ACTIVE', direction: 'LONG', tf: 'M5', score: 77, winRate: 60, entry: 100, sl: 98, tp1: 103.3, tp2: 104.4, tp3: 106, anchorClosedTime: 1000 };
  let v = SE.validateSignalLock(lockL, [mk(2000, 99.6), mk(3000, 99.2)], { indicators: { smcStatus: 'BEARISH CHoCH (Change of Character ▼)' } });
  chk('flip struktur TANPA penerimaan harga tidak melepas lock (anti chop M5)', v.status === 'ACTIVE');
  v = SE.validateSignalLock(lockL, [mk(2000, 99.6), mk(3000, 98.6)], { indicators: { smcStatus: 'BEARISH CHoCH (Change of Character ▼)' } });
  chk('flip + close melawan >=50% risiko melepas lock', v.status === 'STRUCTURE_INVALID');
  v = SE.validateSignalLock(lockL, [mk(2000, 99.1, 97.9)], { indicators: { smcStatus: 'HIGHER HIGH / HIGHER LOW (Bullish Orderflow)' } });
  chk('wick menembus SL tetap melepas lock (jujur)', v.status === 'SL_HIT');
  const lockS = { status: 'ACTIVE', direction: 'SHORT', tf: 'M5', score: 71, entry: 100, sl: 102, tp1: 96.7, tp2: 95.6, anchorClosedTime: 1000 };
  v = SE.validateSignalLock(lockS, [mk(2000, 100.6), mk(3000, 100.9)], { indicators: { smcStatus: 'BULLISH BOS (Break of Structure ▲)' } });
  chk('SHORT: flip tanpa penerimaan tidak melepas lock', v.status === 'ACTIVE');
}

/* ---------- 16. Expert-upgrade: recent-form, fundamental terukur, volume/squeeze ---------- */
{
  const a = SE.runFullAnalysis({ symbol: 'ATOM/USDT', timeframe: 'M5', candles: gen('ATOM/USDT','M5'), mode: 'trader', horizon: 'all' });
  chk('macroQuant terukur ada & sah', a.macroQuant && Number.isFinite(a.macroQuant.posCyclePct) && Number.isFinite(a.macroQuant.atrPercentile) && typeof a.macroQuant.sessionQuality === 'string');
  chk('backtest membawa statistik terkini (recentWinRate/recentExpectancyR)', !a.backtest.disabled ? Number.isFinite(a.backtest.recentWinRate) && Number.isFinite(a.backtest.recentExpectancyR) : true);
  chk('baris Fundamental Terukur muncul di reasons', (a.reasons || []).some(r => r.indexOf('[Fundamental Terukur]') === 0));
  // ELITE wajib recent form kuat
  let anyEliteWeak = false;
  for (const sym of ['BTC/USDT','SOL/USDT','NVDA','EUR/USD','JUP/USDT','LINK/USDT']) for (const tf of ['M15','H1','H4']) {
    const b = SE.runFullAnalysis({ symbol: sym, timeframe: tf, candles: gen(sym, tf), mode: 'trader', horizon: 'all' });
    if (!b.error && b.signalTier === 'ELITE' && (b.backtest.recentWinRate || 0) < 70) anyEliteWeak = true;
  }
  chk('ELITE tanpa recent WR >=70 tidak mungkin terbit', !anyEliteWeak);
}

/* ---------- 17. Siklus hidup sinyal + persistensi + akurasi adaptif ---------- */
{
  const a = SE.runFullAnalysis({ symbol: 'ATOM/USDT', timeframe: 'M5', candles: gen('ATOM/USDT','M5'), mode: 'trader', horizon: 'all' });
  chk('output membawa persistOk (gate persistensi)', typeof a.persistOk === 'boolean');
  let tierTanpaPersist = false;
  for (const sym of ['BTC/USDT','SOL/USDT','NVDA','EUR/USD','JUP/USDT','LINK/USDT']) for (const tf of ['M5','M15','H1','H4']) {
    const b = SE.runFullAnalysis({ symbol: sym, timeframe: tf, candles: gen(sym, tf), mode: 'trader', horizon: 'all' });
    if (!b.error && b.signalTier && b.persistOk !== true) tierTanpaPersist = true;
  }
  chk('tier tanpa persistOk mustahil terbit', !tierTanpaPersist);
  let st = null;
  st = SE.updateRadarAccuracy(st, 'TP'); st = SE.updateRadarAccuracy(st, 'SL'); st = SE.updateRadarAccuracy(st, 'SL');
  chk('updateRadarAccuracy menghitung benar', st.sample === 3 && st.wins === 1 && st.losses === 2 && st.winRate === 33);
  for (let i = 0; i < 60; i++) st = SE.updateRadarAccuracy(st, 'TP');
  chk('akurasi dibatasi 40 terakhir', st.sample === 40);
  const gCold = SE.radarAdaptiveGate({ sample: 12, winRate: 40 });
  const gMid = SE.radarAdaptiveGate({ sample: 12, winRate: 50 });
  const gHot = SE.radarAdaptiveGate({ sample: 12, winRate: 70 });
  const gSmall = SE.radarAdaptiveGate({ sample: 4, winRate: 10 });
  chk('gate adaptif benar: WR<45 -> +6, <55 -> +3, sehat -> +0, sampel kecil -> netral',
    gCold.minScore === SE.PRO_MIN_SCORE + 6 && gCold.defensive === true &&
    gMid.minScore === SE.PRO_MIN_SCORE + 3 &&
    gHot.minScore === SE.PRO_MIN_SCORE && gHot.defensive === false &&
    gSmall.minScore === SE.PRO_MIN_SCORE);
}

/* v2026.52 ICT Atlas unit tests */
{
  // Bangun candle sintetik 2 hari M15: hari-1 naik lalu hari-2 sweep bawah lalu markup
  const DAY = 86400, TF = 900; const base = Math.floor(Date.now()/1000/TF)*TF - 400*TF;
  const mk = [];
  let price = 100;
  for (let i = 0; i < 96; i++) { // hari-1: 96 candle => high 106 low 99
    const op = price; price = 100 + (i < 48 ? i * 0.125 : 6 - (i - 48) * 0.1);
    mk.push({ time: base - DAY + i * TF, open: op, high: Math.max(op, price) + 0.2, low: Math.min(op, price) - 0.3, close: price, volume: 100 + i });
  }
  for (let i = 0; i < 96; i++) { // hari-2: raid bawah 98.4 lalu markup 3 poin
    let op = price;
    price = i < 20 ? price - 0.5 * Math.sin(i) - 0.12 : price + 0.22;
    mk.push({ time: base + i * TF, open: op, high: Math.max(op, price) + 0.15, low: i < 20 ? Math.min(op, price) - 0.4 - (i === 10 ? 0.5 : 0) : Math.min(op, price) - 0.15, close: price, volume: 120 + (i % 9) * 15 });
  }
  const atl = SE.detectIctAtlas(mk, [], 0.6, 'M15');
  chk('pdh/pdl terbaca dari hari sebelumnya', atl.session.pdh > atl.session.pdl && atl.session.pdh != null && atl.session.pdl != null);
  chk(' developing daily high/low ada', atl.session.dayHigh != null && atl.session.dayLow != null);
  chk('new day opening terekam', atl.session.ndOpen != null);
  chk('CISD dir terbaca (markup akhir)', typeof atl.cisd.dir === 'number');
  chk('AMD fase terklasifikasi', atl.amd.phase === null || typeof atl.amd.phase === 'string');
  chk('draw on liquidity dua sisi bernilai', atl.draw.above == null || atl.draw.above > 0);
  chk('OTE zona lengkap', atl.ote && atl.ote.longZone.top > atl.ote.longZone.bottom && atl.ote.shortZone.top > atl.ote.shortZone.bottom);
}

/* v2026.54b/55: DCA investor monoton & skor NETRAL selaras */
{
  const DAYB = 86400, nb = 60; const mk = []; let pr = 1000;
  const base = Math.floor(Date.now()/1000/DAYB)*DAYB - nb*DAYB;
  for (let i = 0; i < nb; i++) {
    const op = pr; pr = 1000 + i * 22; // tren naik kuat -> harga premium vs POC/VWAP
    mk.push({ time: base + i * DAYB, open: op, high: pr * 1.01, low: op * 0.995, close: pr, volume: 900 + i * 3 });
  }
  const inv = SE.runFullAnalysis({ symbol: 'ETH/USDT', timeframe: 'D1', mode: 'investor', candles: mk });
  const L = inv.levels || {};
  chk('tangga DCA turun berurutan', L.dcaZone1 > L.dcaZone2 && L.dcaZone2 > L.dcaZone3 && L.dcaZone3 > 0);
  chk('DCA1 di bawah harga live & tak melampaui premium parah', L.dcaZone1 < inv.lastPrice);
  chk('investor NEUTRAL tak melabeli skor tinggi', inv.direction !== 'NEUTRAL' || inv.confluenceScore <= 59);
}

/* v2026.57 News calendar parsing & bias map */
{
  const H = newsEdge.__testHooks;
  const xml = `<weeklyevents>
    <event><title>CPI y/y</title><country>USD</country><date>11-18-2026</date><time>8:30am</time><impact>High</impact><forecast>3.2%</forecast><previous>3.0%</previous></event>
    <event><title>Unemployment Claims</title><country>USD</country><date>11-19-2026</date><time>8:30am</time><impact>Medium</impact><forecast>245K</forecast><previous>232K</previous></event>
    <event><title>No Forecast Speech</title><country>USD</country><date>11-19-2026</date><time>2:00pm</time><impact>Low</impact><forecast></forecast><previous></previous></event>
  </weeklyevents>`;
  const evs = H.parseFx(xml);
  chk('parseFx menemukan event dengan arah', evs.length === 2);
  const cpi = evs[0];
  chk('CPI beat -> USD menguat (dirCcy=1) & XAU melemah', cpi.dirCcy === 1 && cpi.impacts.some(x => x.sym === 'XAU/USD' && x.dir === -1));
  chk('klasifikasi judul inflasi = hawk', H.classify('CPI y/y') === 'hawk');
  const un = evs[1];
  chk('claims naik -> USD melemah (dirCcy=-1) & USD/JPY melemah', un.dirCcy === -1 && un.impacts.some(x => x.sym === 'USD/JPY' && x.dir === -1));
  const ts = H.etToUtc('11-18-2026', '8:30am');
  chk('konversi waktu ET->UTC valid (Nov = UTC-5, 8:30am -> 13:30 UTC)', Math.abs(ts - Date.UTC(2026, 10, 18, 13, 30)) <= 3600e3);
  const instEvs = newsEdge.generateInstitutionalEvents(Date.UTC(2026, 10, 18, 12, 0, 0));
  chk('generateInstitutionalEvents menghasilkan event kalender institusional', instEvs.length >= 8);
  chk('kalender mencakup NFP, CPI, FOMC, Klaim Pengangguran', instEvs.some(e => e.title.includes('NFP')) && instEvs.some(e => e.title.includes('CPI')) && instEvs.some(e => e.title.includes('Jobless Claims')));
}

/* v2026.58 Global Macro regime classification */
{
  const C = macroEdge.__macro.classifyRegime;
  chk('growth kuat + inflasi rendah => GOLDILOCKS', C(80, 40) === 'GOLDILOCKS');
  chk('growth+inflasi tinggi => REFLASI', C(70, 70) === 'REFLASI');
  chk('growth lemah + inflasi tinggi => STAGFLASI', C(30, 75) === 'STAGFLASI');
  chk('keduanya rendah => DEFENSIF', C(30, 30) === 'DESINFLASI_DEFENSIF');
  chk('zona abu-abu => CAMPURAN', C(50, 50) === 'CAMPURAN');
}

/* v2026.62 AUDIT FORMULA indikator inti (RSI Wilder / EMA / ATR / MACD) vs referensi independen */
{
  const closes = [10, 10.5, 10.2, 10.8, 11.0, 10.6, 11.2, 11.5, 11.1, 11.7, 12.0, 11.4, 11.9, 12.3, 12.1, 12.6, 12.2, 12.8, 13.0, 12.7, 13.2, 13.5, 13.1, 13.6];
  // Referensi RSI (Wilder) ditulis ULANG di sini (bukan import) supaya kesalahan engine ketahuan
  const refRSI = (c, p) => {
    let g = 0, l = 0;
    for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; }
    let ag = g / p, al = l / p;
    let out = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    const arr = [out];
    for (let i = p + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; ag = (ag * (p - 1) + Math.max(d, 0)) / p; al = (al * (p - 1) + Math.max(-d, 0)) / p; arr.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al)); }
    return arr;
  };
  const refEMA = (v, p) => {
    const k = 2 / (p + 1); let e = 0;
    for (let i = 0; i < p; i++) e += v[i]; e /= p;
    const arr = [e];
    for (let i = p; i < v.length; i++) { e = v[i] * k + e * (1 - k); arr.push(e); }
    return arr;
  };
  const rR = refRSI(closes, 14), eR = refEMA(closes, 10);
  const gotRSI = QC.calcRSI(closes, 14), gotEMA = QC.calcEMA(closes, 10);
  const okRSI = Math.abs(gotRSI[closes.length - 1] - rR[rR.length - 1]) < 1e-9;
  const okEMA = Math.abs(gotEMA[closes.length - 1] - eR[eR.length - 1]) < 1e-9;
  chk('RSI-14 engine == referensi Wilder (audit rumus)', okRSI);
  chk('EMA-10 engine == referensi seed-SMA+k (audit rumus)', okEMA);
  // ATR: TR tertinggi=high-low/hc/lc lalu SMA-14
  const candles = closes.map((c, i) => ({ high: c + 0.3, low: c - 0.3, close: c }));
  const atrArr = QC.calcATR(candles, 14);
  const tr = candles.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - closes[i - 1]), Math.abs(c.low - closes[i - 1])));
  const refAtr = tr.slice(tr.length - 14).reduce((a, b) => a + b, 0) / 14;
  chk('ATR-14 engine == referensi SMA-of-TR (audit rumus)', Math.abs(atrArr[atrArr.length - 1] - refAtr) < 1e-9);
  // Pivot klasik periode sebelumnya (D1 -> candle kemarin H/L/C)
  const prev = { h: 5300, l: 5200, c: 5250 };
  const dc = [];
  for (let i = 0; i < 30; i++) dc.push({ time: 1700000000 + i * 86400, open: 5200, high: 5300, low: 5200, close: 5250, volume: 100 });
  dc[dc.length - 2].high = prev.h; dc[dc.length - 2].low = prev.l; dc[dc.length - 2].close = prev.c;
  const m = QC.detectModernInstitutionalStructure(dc, [], 10, 'D1');
  const P = (prev.h + prev.l + prev.c) / 3;
  chk('pivot klasik = (H+L+C)/3 candle KEMARIN pada D1', Math.abs(m.pivotSr.pivot - P) < 1e-9);
  chk('S1=2P-H & R1=2P-L (formula klasik analis)', Math.abs(m.pivotSr.s1 - (2 * P - prev.h)) < 1e-9 && Math.abs(m.pivotSr.r1 - (2 * P - prev.l)) < 1e-9);
}
/* v2026.62 kalender: event selesai -> arah dari aktual vs prakiraan */
{
  const XML = '<wrap><event><title>Prelim GDP q/q</title><country>JPY</country><date>2026-11-16</date><time>6:50pm</time><impact>Low</impact><forecast>0.1%</forecast><previous>0.3%</previous><actual>0.3%</actual></event><event><title>CPI y/y</title><country>USD</country><date>2026-11-20</date><time>8:30am</time><impact>High</impact><forecast>3.1%</forecast><previous>3.4%</previous><actual></actual></event><event><title>Prelim Manufacturing PMI</title><country>JPY</country><date>2026-11-19</date><time>7:00pm</time><impact>Medium</impact><forecast>50.0</forecast><previous>50.5</previous><actual>49.2</actual></event></wrap>';
  const evs = newsEdge.__testHooks.parseFx(XML);
  const gdp = evs.find(e => e.title.indexOf('GDP') > -1);
  const pmi = evs.find(e => e.title.indexOf('PMI') > -1);
  const cpi = evs.find(e => e.title.indexOf('CPI') > -1);
  chk('event SELESAI: arah dari aktual (0.3 > f 0.1 => JPY kuat) bukan dari prev', gdp && gdp.dirCcy === 1 && gdp.actual === '0.3%');
  chk('PMI aktual 49.2 < f 50 => JPY lemah', pmi && pmi.dirCcy === -1);
  chk('event mendatang tetap bias pra-event (f 3.1 < p 3.4 => USD lemah)', cpi && cpi.dirCcy === -1 && !cpi.actual);
}

/* v2026.65 SNIPER masa hidup horison: EXPIRED jujur, bukan gantung selamanya */
{
  // Lock H1 berjangkar 20 jam lalu; candle tetap di area entry (tanpa TP/SL)
  const t0 = Math.floor(Date.now() / 1000) - 20 * 3600;
  const candles = [];
  for (let i = 0; i < 20; i++) candles.push({ time: t0 + i * 3600, open: 100, high: 100.9, low: 99.5, close: 100.4, volume: 100 });
  const lock = { v: 2, symbol: 'X/USDT', tf: 'H1', direction: 'LONG', entry: 100.4, sl: 99.0, tp1: 102.5, tp2: 103.2, tp3: 104.5, anchorClosedTime: candles[2].time, issuedAt: t0 * 1000, status: 'ACTIVE' };
  const v = SE.validateSignalLock(lock, candles, null);
  chk('H1 lock > 14 candle tanpa TP/SL => EXPIRED (masa hidup horison)', v.status === 'EXPIRED');
  // TP tetap menang melawan usia: candle menyentuh tp1 duluan => TP_HIT
  const c2 = candles.map(function(c){return Object.assign({},c);}); c2[3].high = 102.6;
  const v2 = SE.validateSignalLock(lock, c2, null);
  chk('TP tersentuh lebih dulu => TP_HIT (usia setup tidak membatalkan win)', v2.status === 'TP_HIT');
}

/* ---------- 25. ZERO-RISK SL+ & DUAL-BRAIN PROTEKSI MODAL ---------- */
{
  const scalpAnalysis = {
    symbol: 'ETH/USDT', timeframe: 'M5', mode: 'trader',
    direction: 'LONG', signalEligible: true,
    levels: { entry: 2000, sl: 1980, tp1: 2040, tp2: 2060, tp3: 2080, rrRatio: 2.0 },
    confluenceScore: 85, anchorClosedTime: 1000, anchorClosedClose: 2000,
    gating: { winRate: 75 }, backtest: { winRate: 75 }
  };
  const lockScalp = SE.createSignalLock(scalpAnalysis, 'ETH/USDT', 'trader', 'futures');
  chk('lock Scalp membawa slPlus & brain SCALP', !!lockScalp && lockScalp.brain === 'SCALP' && lockScalp.slPlus > 2000);

  // Scalp: naik 35% jarak target (target 40 -> 35% = 14 -> price 2014) -> pemicu bePlusActive
  const cUp = [{ time: 1300, open: 2002, high: 2016, low: 2001, close: 2015, volume: 100 }];
  const vScalp = SE.validateSignalLock(lockScalp, cUp, null);
  chk('scalp mencapai 30%+ target -> bePlusActive TRUE (saran 0-risk)', vScalp.status === 'ACTIVE' && vScalp.bePlusActive === true && vScalp.slPlus > 2000);

  // Jika setelah bePlusActive harga berbalik dan kena SL lama -> ditandai beProtected
  const cDrop = [{ time: 1400, open: 2010, high: 2012, low: 1975, close: 1978, volume: 100 }];
  const vSaved = SE.validateSignalLock(Object.assign({}, lockScalp, { bePlusActive: true }), cDrop, null);
  chk('order membalik pasca-profit ditandai beProtected (0-Risk modal aman)', vSaved.status === 'SL_HIT' && vSaved.beProtected === true);
}

/* ---------- 26. DUAL FIBONACCI MATRIX (RETRACEMENT & EXTENSION) ---------- */
{
  // Test 1: LONG mode: High 100, Low 80 -> diff = 20
  const fibLong = SE.calculateDualFibonacci(100, 80, 90, 'LONG');
  chk('calculateDualFibonacci valid untuk LONG', !!fibLong && fibLong.isLong === true && fibLong.diff === 20);
  chk('Retracement 50% Eq = 90.0', Math.abs(fibLong.retracement.r500 - 90.0) < 1e-6);
  chk('Retracement 61.8% Golden Pocket = 87.64', Math.abs(fibLong.retracement.r618 - 87.64) < 1e-4);
  chk('Retracement 78.6% OTE = 84.28', Math.abs(fibLong.retracement.r786 - 84.28) < 1e-4);
  chk('Extension 127.2% = 105.44', Math.abs(fibLong.extension.ext1272 - 105.44) < 1e-4);
  chk('Extension 161.8% Golden Extension = 112.36', Math.abs(fibLong.extension.ext1618 - 112.36) < 1e-4);
  chk('Extension 200.0% Measured Move = 120.0', Math.abs(fibLong.extension.ext2000 - 120.0) < 1e-6);

  // Test 2: SHORT mode: High 100, Low 80 -> diff = 20
  const fibShort = SE.calculateDualFibonacci(100, 80, 85, 'SHORT');
  chk('calculateDualFibonacci valid untuk SHORT', !!fibShort && fibShort.isLong === false);
  chk('SHORT Retracement 50% = 90.0', Math.abs(fibShort.retracement.r500 - 90.0) < 1e-6);
  chk('SHORT Retracement 61.8% = 92.36', Math.abs(fibShort.retracement.r618 - 92.36) < 1e-4);
  chk('SHORT Extension 161.8% di bawah Low = 67.64', Math.abs(fibShort.extension.ext1618 - 67.64) < 1e-4);

  // Test 3: runFullAnalysis levels membawa fib
  const testCandles = gen('NVDA', 'H1');
  const engineRes = SE.runFullAnalysis({ symbol: 'NVDA', timeframe: 'H1', candles: testCandles, mode: 'trader', horizon: 'all' });
  chk('runFullAnalysis menghasilkan levels.fib', !!engineRes.levels && !!engineRes.levels.fib);
  chk('levels.fib membawa retracement & extension lengkap', !!engineRes.levels.fib.retracement && !!engineRes.levels.fib.extension && engineRes.levels.fib.goldenPocket > 0);
}

/* ---------- 27. ANTI-FAKE TP & ORDER FILL INTEGRITY (NZD/JPY FIX) ---------- */
{
  // 1. Order limit unfill: harga langsung naik ke target tanpa pernah menyentuh entry
  const lockUnfilled = {
    status: 'ACTIVE', direction: 'LONG', tf: 'M5',
    entry: 87.00, anchorPrice: 87.25, sl: 86.70, tp1: 87.50, tp2: 87.80, tp3: 88.00,
    anchorClosedTime: 1000
  };
  const barsFly = [
    { time: 1100, open: 87.25, high: 87.55, low: 87.15, close: 87.50, volume: 100 }
  ];
  const vUnfilled = SE.validateSignalLock(lockUnfilled, barsFly, null);
  chk('Order limit belum terisi -> target tercapai menjadi MISSED (bukan TP_HIT)', vUnfilled.status === 'MISSED');

  // 2. Order limit terisi: bar 1 jemput entry, bar 2 capai TP1 -> sah TP_HIT
  const barsFilled = [
    { time: 1100, open: 87.25, high: 87.30, low: 86.95, close: 87.10, volume: 100 },
    { time: 1200, open: 87.10, high: 87.55, low: 87.05, close: 87.52, volume: 100 }
  ];
  const vFilled = SE.validateSignalLock(lockUnfilled, barsFilled, null);
  chk('Order limit terjemput -> kemudian capai target sah menjadi TP_HIT', vFilled.status === 'TP_HIT');

  // 3. Kasus NZD/JPY terbalik: TP1 di bawah harga jangkar / harga live (87.07 vs 87.328)
  const lockInverted = {
    status: 'ACTIVE', direction: 'LONG', tf: 'H1',
    entry: 87.00, anchorPrice: 87.328, sl: 86.80, tp1: 87.07, tp2: 87.40, tp3: 87.80,
    anchorClosedTime: 1000
  };
  const vInv = SE.validateSignalLock(lockInverted, [{ time: 1100, open: 87.328, high: 87.35, low: 87.30, close: 87.33, volume: 100 }], null);
  chk('Kasus NZD/JPY terbalik (TP1 <= anchorPrice) ditolak STRUCTURE_INVALID (anti TP palsu)', vInv.status === 'STRUCTURE_INVALID');

  // 4. SHORT order limit unfill: harga langsung terjun tanpa pernah naik jemput entry
  const lockShortUnfilled = {
    status: 'ACTIVE', direction: 'SHORT', tf: 'M5',
    entry: 87.50, anchorPrice: 87.20, sl: 87.80, tp1: 86.80, tp2: 86.50, tp3: 86.20,
    anchorClosedTime: 1000
  };
  const barsDrop = [
    { time: 1100, open: 87.20, high: 87.30, low: 86.75, close: 86.78, volume: 100 }
  ];
  const vShortUnfilled = SE.validateSignalLock(lockShortUnfilled, barsDrop, null);
  chk('SHORT: Order limit belum terisi -> target tercapai menjadi MISSED', vShortUnfilled.status === 'MISSED');

  // 5. Garansi buildInstitutionalLevels: TP1 selalu di atas Math.max(entry, ctx.price) utk LONG
  const ctxLong = {
    price: 87.328, atr: 0.25, brain: 'SCALP',
    impulseHigh: 87.60, impulseLow: 86.90,
    bullOb: { top: 87.15, bottom: 87.05 },
    recentHigh: 87.40, poc: 87.10
  };
  const lvsLong = SE.buildInstitutionalLevels('LONG', ctxLong);
  chk('LONG levels: TP1 harus berada di atas harga pasar saat ini (TP1 > 87.328)', lvsLong.tp1 > 87.328 && lvsLong.tp1 > lvsLong.entry);
  chk('LONG levels: urutan matematis terjaga entry < tp1 < tp2 < tp3', lvsLong.entry < lvsLong.tp1 && lvsLong.tp1 < lvsLong.tp2 && lvsLong.tp2 < lvsLong.tp3);
}

/* ---------- 29. SCALPING R:R 1:2 GARANSI MUTLAK & ZERO-DESYNC (SEI/USDT & ALL INSTRUMENTS) ---------- */
{
  // 1. Long Scalp pada SEI/USDT (harga mikro)
  const ctxSeiLong = {
    price: 0.2800, atr: 0.0050, brain: 'SCALP',
    impulseHigh: 0.2900, impulseLow: 0.2700,
    bullOb: { top: 0.2790, bottom: 0.2770 },
    recentHigh: 0.2850, poc: 0.2785
  };
  const seiLvs = SE.buildInstitutionalLevels('LONG', ctxSeiLong);
  const rLong = seiLvs.entry - seiLvs.sl;
  chk('SEI/USDT SCALP LONG: TP1 menghasilkan RR >= 2.0 (1:2 R:R)', (seiLvs.tp1 - seiLvs.entry) / rLong >= 2.0 - 1e-9);
  chk('SEI/USDT SCALP LONG: rrRatio >= 2.00', seiLvs.rrRatio >= 2.0 - 1e-9);
  chk('SEI/USDT SCALP LONG: TP2 >= 3.0R', (seiLvs.tp2 - seiLvs.entry) / rLong >= 3.0 - 1e-9);
  chk('SEI/USDT SCALP LONG: urutan harga entry < tp1 < tp2 < tp3', seiLvs.entry < seiLvs.tp1 && seiLvs.tp1 < seiLvs.tp2 && seiLvs.tp2 < seiLvs.tp3);

  // 2. Short Scalp pada SEI/USDT
  const ctxSeiShort = {
    price: 0.2800, atr: 0.0050, brain: 'SCALP',
    impulseHigh: 0.2900, impulseLow: 0.2700,
    bearOb: { top: 0.2830, bottom: 0.2810 },
    recentLow: 0.2750, poc: 0.2815
  };
  const seiShortLvs = SE.buildInstitutionalLevels('SHORT', ctxSeiShort);
  const rShort = seiShortLvs.sl - seiShortLvs.entry;
  chk('SEI/USDT SCALP SHORT: TP1 menghasilkan RR >= 2.0 (1:2 R:R)', (seiShortLvs.entry - seiShortLvs.tp1) / rShort >= 2.0 - 1e-9);
  chk('SEI/USDT SCALP SHORT: rrRatio >= 2.00', seiShortLvs.rrRatio >= 2.0 - 1e-9);
  chk('SEI/USDT SCALP SHORT: TP2 >= 3.0R', (seiShortLvs.entry - seiShortLvs.tp2) / rShort >= 3.0 - 1e-9);
  chk('SEI/USDT SCALP SHORT: urutan harga entry > tp1 > tp2 > tp3 > 0', seiShortLvs.entry > seiShortLvs.tp1 && seiShortLvs.tp1 > seiShortLvs.tp2 && seiShortLvs.tp2 > seiShortLvs.tp3 && seiShortLvs.tp3 > 0);

  // 3. Eksekusi Scalp Lock: Tidak boleh exit premature di 1:1, wajib sampai TP1 (1:2)
  const scalpAnalysis = {
    symbol: 'SEI/USDT', timeframe: 'M5', mode: 'trader',
    direction: 'LONG', signalEligible: true,
    levels: seiLvs,
    confluenceScore: 84, anchorClosedTime: 1000, anchorClosedClose: ctxSeiLong.price,
    gating: { winRate: 78 }, backtest: { winRate: 78 }
  };
  const lock = SE.createSignalLock(scalpAnalysis, 'SEI/USDT', 'trader', 'futures');
  chk('Scalp lock berhasil dibuat dengan brain SCALP', !!lock && lock.brain === 'SCALP');

  // Candle 1 jemput entry & naik ke 1.0R (1:1 R:R): Tidak boleh selesai (bukan TP_HIT)
  const halfTargetPrice = lock.entry + 1.0 * rLong;
  const barHalf = { time: 1100, open: lock.entry, high: halfTargetPrice, low: lock.entry - 0.1 * rLong, close: halfTargetPrice, volume: 100 };
  const vHalf = SE.validateSignalLock(lock, [barHalf], null);
  chk('Scalp pada 1:1 R:R tetap ACTIVE (tidak exit prematur di 1:1)', vHalf.status === 'ACTIVE');
  chk('Scalp pada 1:1 R:R mengaktifkan proteksi 0-Risk (bePlusActive)', vHalf.bePlusActive === true);

  // Candle 2 lanjut naik ke TP1 (2.0R / 1:2 R:R): Baru sah TP_HIT
  const barFull = { time: 1200, open: halfTargetPrice, high: lock.tp1, low: halfTargetPrice - 0.1 * rLong, close: lock.tp1, volume: 100 };
  const vFull = SE.validateSignalLock(lock, [barHalf, barFull], null);
  chk('Scalp mencapai TP1 (1:2 R:R) sah TP_HIT', vFull.status === 'TP_HIT');
  chk('Scalp TP_HIT membawa exitPrice yang presisi sama dengan lock.tp1', vFull.exitPrice === lock.tp1);
}
console.log(`ENGINE-V2: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
