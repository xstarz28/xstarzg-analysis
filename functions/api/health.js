import { getTodayProviderCredits, getUtcDateString } from '../lib/db.js';
export async function onRequestGet(context) {
  const t0 = performance.now();
  const db = context.env?.DB || null;
  let d1Connected = false;
  let tableCount = 0;
  let twelveDataCreditsUsed = 0;
  if (db) {
    try {
      const row = await db
        .prepare("SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'")
        .first();
      tableCount = Number(row?.cnt || 0);
      d1Connected = true;
      twelveDataCreditsUsed = await getTodayProviderCredits(db, 'twelvedata');
    } catch (_) {
      d1Connected = false;
    }
  }
  const computeMs = Number((performance.now() - t0).toFixed(2));
  return new Response(
    JSON.stringify({
      ok: true,
      service: 'XSTARZG Analysis Edge API',
      d1Connected,
      tableCount,
      utcDate: getUtcDateString(),
      twelveDataCredits: {
        used: twelveDataCreditsUsed,
        softLimit: 650,
        hardLimit: 780,
        dailyMax: 800
      },
      computeMs
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Compute-Time-Ms': String(computeMs)
      }
    }
  );
}