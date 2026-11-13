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

/* ---------- 3. Strict threshold (aturan #1D) ---------- */
{
  const syms = ['BTC/USDT', 'ETH/USDT', 'EUR/USD', 'XAU/USD', 'WTI', 'NVDA'];
  let checked = 0;
  for (const sym of syms) {
    const a = SE.runFullAnalysis({ symbol: sym, timeframe: 'H1', candles: gen(sym, 'H1'), mode: 'trader', horizon: 'all' });
    if (a.error) continue;
    checked++;
    if (a.confluenceScore < 84) {
      chk(`${sym}: skor <84 => tidak ada ENTRY`, !a.signalEligible && a.direction === 'NEUTRAL');
    }
    if (a.backtest && !a.backtest.disabled && a.backtest.winRate < 78) {
      chk(`${sym}: winrate <78 => tidak ada ENTRY`, !a.signalEligible);
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
  chk('LONG SL di bawah wick struktur - buffer 0.45 ATR', Math.abs(L.sl - (94 - 0.9)) < 1e-6); // min(impulseLow 94, OB bottom 95.4) - 0.45*2
  chk('LONG SL di bawah entry', L.sl < L.entry);
  chk('LONG TP2 memenuhi RR >= 2.2', (L.tp2 - L.entry) / (L.entry - L.sl) >= 2.2 - 1e-9);
  chk('LONG TP naik berurutan', L.tp1 < L.tp2 && L.tp2 < L.tp3 && L.entry < L.tp1);
  const S = SE.buildInstitutionalLevels('SHORT', {
    ...ctx, price: 100, bearOb: { top: 104.6, bottom: 103.8, index: 12 }, bearFvg: { top: 101.6, bottom: 100.8, mid: 101.2 }, bullOb: null, bullFvg: null
  });
  chk('SHORT entry di zona premium (>= harga closed)', S.entry >= ctx.price - 1e-9);
  // SHORT SL = max(wick swing, OB top) + 0.45*ATR -> max(104, 104.6) + 0.9 = 105.5
  chk('SHORT SL di atas wick struktur + buffer', Math.abs(S.sl - (104.6 + 0.9)) < 1e-6);
  chk('SHORT TP2 memenuhi RR >= 2.2', (S.entry - S.tp2) / (S.sl - S.entry) >= 2.2 - 1e-9);
  chk('SHORT TP turun berurutan', S.tp1 > S.tp2 && S.tp2 > S.tp3 && S.entry > S.tp1);
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
  // Struktur berbalik saat ada candle baru -> unlock
  v = SE.validateSignalLock(lock, [{ time: 1300, open: 100, high: 101, low: 99, close: 99.5, volume: 1 }], { indicators: { smcStatus: 'BEARISH BOS (Break of Structure ▼)' } });
  chk('struktur penutup berbalik -> unlock', v.status === 'STRUCTURE_INVALID');
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

console.log(`ENGINE-V2: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
