/* ==================== PUBLIC TRACK RECORD (SINYAL BOT) ====================
   Menyajikan rekam jejak sinyal yang benar-benar DIPUBLIKASIKAN bot 24/7
   (channel 'sentinel') dan sudah diputuskan: TP, SL, invalidasi, kedaluwarsa,
   dibatalkan. Loss tetap dihitung — tidak ada cherry-picking.
   Tidak memuat data pribadi: hanya simbol, timeframe, arah, status, dan R.
   ======================================================================== */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=300'
};

/* R multiple per hasil akhir. TP memakai target 1:2 yang memang dipublikasikan.
   STRUCTURE_INVALID = setup ditolak/diinvalidasi SEBELUM terisi (proteksi data),
   jadi BUKAN loss trading: 0R dan tidak dihitung sebagai kekalahan. */
const R_BY_STATUS = {
  TP_HIT: 2,
  BE_SAVED: 0,
  SL_HIT: -1,
  STRUCTURE_INVALID: 0,
  EXPIRED: 0,
  CANCELLED: 0,
  MISSED: 0
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export function aggregatePerformance(rows = []) {
  let wins = 0, losses = 0, be = 0, invalid = 0;
  let totalR = 0, grossWin = 0, grossLoss = 0, equity = 0, peak = 0, maxDD = 0;
  const byStatus = {};
  const curve = [{ i: 0, r: 0 }];
  const chronological = [...rows].sort((a, b) =>
    Number(a.at || a.issued_at || 0) - Number(b.at || b.issued_at || 0));
  chronological.forEach((row, index) => {
    const status = String(row.status || row.outcome_status || '').toUpperCase();
    const r = Object.prototype.hasOwnProperty.call(R_BY_STATUS, status) ? R_BY_STATUS[status] : 0;
    byStatus[status] = (byStatus[status] || 0) + 1;
    if (status === 'TP_HIT') wins++;
    else if (status === 'SL_HIT') losses++;
    else if (status === 'BE_SAVED') be++;
    else if (status === 'STRUCTURE_INVALID') invalid++;
    totalR += r;
    equity += r;
    if (r > 0) grossWin += r;
    else if (r < 0) grossLoss += Math.abs(r);
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
    curve.push({ i: index + 1, r: Number(equity.toFixed(2)) });
  });
  const decided = wins + losses;
  return {
    total: chronological.length,
    wins,
    losses,
    be,
    invalid,
    byStatus,
    decided,
    winRate: decided ? Math.round((wins / decided) * 100) : 0,
    totalR: Number(totalR.toFixed(2)),
    avgR: chronological.length ? Number((totalR / chronological.length).toFixed(2)) : 0,
    maxDD: Number(maxDD.toFixed(2)),
    profitFactor: grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2))
      : (grossWin > 0 ? null : 0),
    curve
  };
}

export async function onRequestGet({ env }) {
  const e = env || {};
  if (!e.DB) {
    return Response.json({ ok: false, error: 'Performance store unavailable' }, { status: 503, headers: CORS });
  }
  try {
    const result = await e.DB.prepare(`
      SELECT symbol, tf, direction, entry, score, status, outcome_status,
             outcome_at, issued_at
      FROM cloud_signal_locks
      WHERE channel = 'sentinel' AND status != 'ACTIVE'
      ORDER BY COALESCE(outcome_at, issued_at) DESC
      LIMIT 500
    `).all();
    const rows = (result && result.results) || [];
    const stats = aggregatePerformance(rows.map(row => ({
      ...row,
      status: row.outcome_status || row.status,
      at: row.outcome_at || row.issued_at
    })));
    const recent = rows.slice(0, 40).map(row => ({
      symbol: row.symbol,
      tf: row.tf,
      direction: row.direction,
      status: String(row.outcome_status || row.status || '').toUpperCase(),
      score: row.score,
      at: Number(row.outcome_at || row.issued_at) || 0
    }));
    return Response.json({ ok: true, scope: 'bot', stats, recent, generatedAt: Date.now() }, { headers: CORS });
  } catch (err) {
    // Tabel belum ada / D1 belum siap: UI memakai jurnal pribadi saja.
    return Response.json({ ok: false, error: 'Performance store unavailable' }, { headers: CORS });
  }
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return onRequestOptions(context);
  if (context.request.method === 'GET') return onRequestGet(context);
  return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405, headers: CORS });
}
