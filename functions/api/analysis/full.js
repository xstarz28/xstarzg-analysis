import { generateFullSignalAnalysis } from '../../../public/js/shared/signal-engine.js';
import {
  getAuthenticatedUser,
  hashIpAddress,
  FREE_ANALYSIS_QUOTA_LIMIT
} from '../../lib/auth.js';
const CACHE_TTL_BY_TF_SEC = {
  M1: 45,
  M5: 120,
  M15: 300,
  M30: 600,
  H1: 900,
  H4: 1800,
  D1: 3600,
  W1: 7200,
  MN: 14400,
  '1Y': 28800
};
function sanitizeCandles(rawCandles) {
  if (!Array.isArray(rawCandles)) return [];
  const cleaned = [];
  const maxSlice = rawCandles.slice(-500);
  for (let i = 0; i < maxSlice.length; i++) {
    const c = maxSlice[i];
    if (!c) continue;
    const time = Number(c.time);
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    const volume = Number(c.volume || 0);
    if (
      !Number.isFinite(time) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      high < low ||
      close <= 0
    ) {
      continue;
    }
    const item = { time, open, high, low, close, volume: Math.max(0, volume) };
    if (Number.isFinite(Number(c.takerBuyVol))) {
      item.takerBuyVol = Number(c.takerBuyVol);
    }
    cleaned.push(item);
  }
  cleaned.sort((a, b) => a.time - b.time);
  return cleaned;
}
export async function onRequestPost(context) {
  const t0 = performance.now();
  const { request, env } = context;
  const db = env?.DB || null;
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Payload JSON tidak valid.' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
  const symbol = String(body.symbol || 'BTCUSDT').trim().toUpperCase();
  const assetClass = String(body.assetClass || 'crypto').trim().toLowerCase();
  const timeframe = String(body.timeframe || 'H1').trim().toUpperCase();
  const mode = body.mode === 'investor' ? 'investor' : 'trader';
  const extraContext = body.extraContext && typeof body.extraContext === 'object' ? body.extraContext : {};
  const candles = sanitizeCandles(body.candles);
  if (candles.length < 50) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Data historis tidak mencukupi (${candles.length} candle). Minimal dibutuhkan 50 candle.`
      }),
      { status: 422, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const authUser = await getAuthenticatedUser(context);
  const ipHash = await hashIpAddress(request);
  const effectiveUserId = authUser ? authUser.id : `guest_${ipHash}`;
  const isVipActive = Boolean(
    authUser && authUser.role === 'vip' && Number(authUser.vip_until || 0) > nowSec
  );
  const isAdmin = Boolean(authUser && authUser.role === 'admin');
  const isUnlimited = isAdmin || isVipActive;
  let usedCount = 0;
  let alreadyUnlockedForPair = false;
  if (db && !isUnlimited) {
    try {
      const existingPairLog = await db
        .prepare(
          `SELECT id FROM quota_logs
           WHERE (user_id = ? OR ip_hash = ?) AND symbol = ? AND timeframe = ?
           LIMIT 1`
        )
        .bind(effectiveUserId, ipHash, symbol, timeframe)
        .first();
      alreadyUnlockedForPair = Boolean(existingPairLog);
      const countRow = await db
        .prepare(
          `SELECT COUNT(*) AS total
           FROM quota_logs
           WHERE user_id = ? OR ip_hash = ?`
        )
        .bind(effectiveUserId, ipHash)
        .first();
      usedCount = Number(countRow?.total || 0);
      if (!alreadyUnlockedForPair && usedCount >= FREE_ANALYSIS_QUOTA_LIMIT) {
        return new Response(
          JSON.stringify({
            ok: false,
            code: 'QUOTA_EXCEEDED',
            error:
              'Kuota gratis 2x Full Analysis Anda telah habis. Silakan masuk atau upgrade ke VIP (USDT BEP-20) untuk akses tanpa batas.',
            quota: {
              unlimited: false,
              limit: FREE_ANALYSIS_QUOTA_LIMIT,
              used: usedCount,
              remaining: 0,
              role: authUser?.role || 'free',
              requiresAuth: !authUser
            }
          }),
          {
            status: 402,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store'
            }
          }
        );
      }
    } catch (_) {}
  }
  const cacheKey = `sig:${symbol}:${timeframe}:${mode}`;
  let analysisPayload = null;
  let fromCache = false;
  if (db && !body.forceRefresh) {
    try {
      const cached = await db
        .prepare(
          `SELECT payload_json, compute_ms, updated_at, expires_at
           FROM signal_cache
           WHERE cache_key = ? AND expires_at > ?
           LIMIT 1`
        )
        .bind(cacheKey, nowSec)
        .first();
      if (cached && cached.payload_json) {
        const parsed = JSON.parse(cached.payload_json);
        const latestCandleClose = candles[candles.length - 1].close;
        const cachedRefPrice = Number(parsed?.signal?.entryPrice || 0);
        const driftPct =
          cachedRefPrice > 0
            ? Math.abs(latestCandleClose - cachedRefPrice) / cachedRefPrice
            : 0;
        if (driftPct < 0.015) {
          analysisPayload = parsed;
          fromCache = true;
        }
      }
    } catch (_) {}
  }
  if (!analysisPayload) {
    try {
      analysisPayload = generateFullSignalAnalysis({
        symbol,
        assetClass,
        timeframe,
        mode,
        candles,
        extraContext
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Gagal menjalankan mesin kuantitatif: ${err.message || 'Engine error'}`
        }),
        { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
    const computeMsSoFar = Number((performance.now() - t0).toFixed(2));
    const ttlSec = CACHE_TTL_BY_TF_SEC[timeframe] || 600;
    const expiresAt = nowSec + ttlSec;
    if (db) {
      try {
        await db
          .prepare(
            `INSERT INTO signal_cache (cache_key, symbol, asset_class, timeframe, mode, payload_json, compute_ms, updated_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(cache_key) DO UPDATE SET
               payload_json = excluded.payload_json,
               compute_ms = excluded.compute_ms,
               updated_at = excluded.updated_at,
               expires_at = excluded.expires_at`
          )
          .bind(
            cacheKey,
            symbol,
            assetClass,
            timeframe,
            mode,
            JSON.stringify(analysisPayload),
            computeMsSoFar,
            nowSec,
            expiresAt
          )
          .run();
      } catch (_) {}
    }
  }
  if (db && !isUnlimited && !alreadyUnlockedForPair) {
    try {
      if (!authUser) {
        await db
          .prepare(
            `INSERT OR IGNORE INTO users (id, google_sub, email, display_name, avatar_url, role, vip_until, created_at, updated_at)
             VALUES (?, ?, ?, 'Guest Trader', '', 'free', 0, ?, ?)`
          )
          .bind(
            effectiveUserId,
            `guest_sub_${ipHash}`,
            `${effectiveUserId}@guest.xstarzganalysis.local`,
            nowSec,
            nowSec
          )
          .run();
      }
      await db
        .prepare(
          `INSERT INTO quota_logs (user_id, ip_hash, symbol, timeframe, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(effectiveUserId, ipHash, symbol, timeframe, nowSec)
        .run();
      usedCount += 1;
    } catch (_) {}
  }
  const totalComputeMs = Number((performance.now() - t0).toFixed(2));
  const quotaResponse = isUnlimited
    ? {
        unlimited: true,
        limit: null,
        used: 0,
        remaining: null,
        role: authUser.role,
        vipUntil: Number(authUser.vip_until || 0)
      }
    : {
        unlimited: false,
        limit: FREE_ANALYSIS_QUOTA_LIMIT,
        used: usedCount,
        remaining: Math.max(0, FREE_ANALYSIS_QUOTA_LIMIT - usedCount),
        role: authUser?.role || 'free',
        vipUntil: 0,
        alreadyUnlockedPair: alreadyUnlockedForPair
      };
  return new Response(
    JSON.stringify({
      ok: true,
      fromCache,
      computeMs: totalComputeMs,
      quota: quotaResponse,
      ...analysisPayload
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Compute-Time-Ms': String(totalComputeMs),
        'Cache-Control': 'no-store'
      }
    }
  );
}