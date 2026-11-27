/* ==================== DOKTRIN INTERNAL XSTARZG (TIDAK DIRENDER) ====================
   Kerangka jati diri engine: Market Analysis (struktur, key levels, price action),
   Risk Management (position sizing, exit planning, capital protection),
   Trading Psychology (emosi, disiplin, kesabaran), dan Trading Process
   (strategi, testing, review/jurnal).

   Modul ini SENGAJA tidak menambah kartu atau angka apa pun di dashboard.
   Ia hanya dipakai sebagai gerbang bukti internal sebelum sinyal dipublikasikan
   ke Telegram/publik: bila salah satu pilar wajib belum terpenuhi, sinyal ditahan
   daripada mengirim "skor tinggi" yang belum punya bukti eksekusi.
   ================================================================================ */

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const FOMO_GATES = ['FOMO_ZONE', 'SNIPER_PREMIUM', 'OVEREXTENDED', 'CHASE', 'LATE_ENTRY'];

function finitePositive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

/**
 * Menilai kelengkapan bukti sebuah setup memakai 4 pilar doktrin.
 * @returns {{integrity:number, pillars:Object, blockers:string[], verdict:'PASS'|'HOLD'}}
 */
export function evaluateDoctrine({ analysis = null, journal = null } = {}) {
  const a = analysis || {};
  const td = a.topDown || {};
  const lv = a.levels || {};
  const ind = a.indicators || {};
  const master = a.masterProfile || {};
  const blockers = [];

  const dir = a.direction === 'LONG' || a.direction === 'SHORT' ? a.direction : 'NEUTRAL';
  const want = dir === 'LONG' ? 'BULLISH' : dir === 'SHORT' ? 'BEARISH' : 'NEUTRAL';

  const entry = num(lv.entry || a.entry);
  const sl = num(lv.sl || a.sl);
  const tp1 = num(lv.tp1 || a.tp1);
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp1 - entry);

  /* Prinsip: data yang TIDAK ADA bukan otomatis kegagalan (payload lama tetap
     boleh lolos). Yang diblokir hanya bukti yang ADA dan saling bertentangan. */
  const hasMacro = !!(td.macroBias || td.structBias);
  const hasExec = !!td.execBias;

  /* 1. MARKET ANALYSIS ------------------------------------------------ */
  // Struktur: bila makro & struktur tersedia, keduanya wajib searah arah trade.
  const structureOk = want !== 'NEUTRAL' && (!hasMacro || (td.macroBias === want && td.structBias === want));
  if (!structureOk) blockers.push('STRUCTURE_NOT_ALIGNED');

  // Key levels: Entry/SL/TP harus valid dan berada di sisi yang benar.
  const levelsValid = finitePositive(entry) && finitePositive(sl) && finitePositive(tp1) &&
    (dir === 'LONG' ? sl < entry && tp1 > entry : dir === 'SHORT' ? sl > entry && tp1 < entry : false);
  const keyLevelsOk = levelsValid;
  if (!keyLevelsOk) blockers.push('KEY_LEVELS_INVALID');

  // Price action: konfirmasi candle eksekusi (LTF 5m/1m) searah setup.
  // Ini pilar yang menahan sinyal M15 "skor tinggi" saat M5/M1 belum searah.
  const priceActionOk = want !== 'NEUTRAL' && (!hasExec || td.execBias === want);
  if (!priceActionOk) blockers.push('EXECUTION_NOT_CONFIRMED');

  /* 2. RISK MANAGEMENT ------------------------------------------------ */
  // Exit planning: minimal 1:2 R:R. Kapital: risiko per posisi wajar bila diketahui.
  const rr = risk > 0 ? reward / risk : 0;
  const rrOk = rr >= 1.9;
  if (!rrOk) blockers.push('RISK_REWARD_TOO_LOW');
  const riskPct = num(master.riskPct, 0);
  const sizingOk = !(riskPct > 0) || riskPct <= 3;
  if (!sizingOk) blockers.push('POSITION_SIZE_TOO_LARGE');
  const riskOk = rrOk && sizingOk;

  /* 3. TRADING PSYCHOLOGY --------------------------------------------- */
  // FOMO/euforia dicegah; RSI ekstrem melawan arah = kesabaran belum lulus.
  const gateReasons = Array.isArray(a.gateReasons) ? a.gateReasons.map(r => String(r).toUpperCase()) : [];
  const fomoBlocked = gateReasons.some(r => FOMO_GATES.includes(r));
  const rsi = num(ind.rsi, 50);
  const rsiExtreme = (dir === 'LONG' && rsi >= 78) || (dir === 'SHORT' && rsi <= 22);
  const psychOk = want !== 'NEUTRAL' && !fomoBlocked && !rsiExtreme;
  if (!psychOk) blockers.push(fomoBlocked ? 'FOMO_BLOCKED' : 'EMOTION_RISK');

  /* 4. TRADING PROCESS ------------------------------------------------- */
  // Setup harus terkunci pada periode candle (rencana tetap) dan/atau tercatat
  // di jurnal — bukti bahwa sinyal bagian dari proses, bukan tembakan acak.
  const planLocked = !!(a.lockedSignal || a.anchorClosedTime || a.timeframe ||
    (journal && (journal.symbol || journal.id)));
  const processOk = planLocked && a.signalEligible === true;
  if (!processOk) blockers.push('PROCESS_NOT_RECORDED');

  const weights = {
    structure: 25,
    keyLevels: 20,
    priceAction: 20,
    risk: 15,
    psych: 10,
    process: 10
  };
  const passed = {
    structure: structureOk,
    keyLevels: keyLevelsOk,
    priceAction: priceActionOk,
    risk: riskOk,
    psych: psychOk,
    process: processOk
  };
  let integrity = 0;
  for (const key of Object.keys(weights)) {
    if (passed[key]) integrity += weights[key];
  }

  // Pilar wajib: struktur + key levels + price action. Tanpa ketiganya, setup
  // tidak boleh dipublikasikan walau skor konfluensi tinggi.
  const mandatoryOk = structureOk && keyLevelsOk && priceActionOk;
  const verdict = mandatoryOk && integrity >= 70 ? 'PASS' : 'HOLD';

  return {
    integrity,
    verdict,
    rr: Number(rr.toFixed(2)),
    pillars: {
      marketAnalysis: { structureOk, keyLevelsOk, priceActionOk },
      riskManagement: { rrOk, sizingOk, exposurePct: riskPct },
      tradingPsychology: { fomoBlocked, rsiExtreme, psychOk },
      tradingProcess: { planLocked, processOk }
    },
    blockers
  };
}

export const TRADING_DOCTRINE_VERSION = '2027.01';
