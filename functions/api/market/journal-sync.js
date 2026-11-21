// functions/api/market/journal-sync.js
// Sinkronisasi Sinyal Terverifikasi Antara 24/7 Cloud Sentinel & Jurnal Trader di Web/HP

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sentinel-Key',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

async function ensureTable(db) {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS cloud_signal_locks (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        tf TEXT NOT NULL,
        direction TEXT NOT NULL,
        entry REAL NOT NULL,
        sl REAL NOT NULL,
        tp1 REAL NOT NULL,
        tp2 REAL,
        tp3 REAL,
        sl_plus REAL,
        be_plus_active INTEGER DEFAULT 0,
        filled INTEGER DEFAULT 0,
        score INTEGER NOT NULL,
        status TEXT DEFAULT 'ACTIVE',
        issued_at INTEGER NOT NULL,
        outcome_status TEXT,
        outcome_reason TEXT,
        outcome_at INTEGER,
        payload TEXT
      )
    `).run();
  } catch (e) {}
}

const memoryLocks = new Map();
const memoryOutcomes = [];

export async function onRequestGet(context) {
  const env = (context && context.env) || {};
  if (!env.DB) {
    const active = Array.from(memoryLocks.values()).filter(l => l.status === 'ACTIVE');
    return Response.json({
      ok: true,
      activeLocks: active,
      recentOutcomes: memoryOutcomes.slice(-60),
      outcomes: memoryOutcomes.slice(-60)
    }, { headers: CORS });
  }

  await ensureTable(env.DB);
  try {
    const activeRes = await env.DB.prepare(`
      SELECT * FROM cloud_signal_locks
      WHERE status = 'ACTIVE'
      ORDER BY issued_at DESC
      LIMIT 60
    `).all();

    const outcomeRes = await env.DB.prepare(`
      SELECT * FROM cloud_signal_locks
      WHERE status != 'ACTIVE'
      ORDER BY outcome_at DESC
      LIMIT 60
    `).all();

    const activeLocks = (activeRes && activeRes.results) || [];
    const outcomes = (outcomeRes && outcomeRes.results) || [];

    const formattedActive = activeLocks.map(r => {
      try {
        if (r.payload) return JSON.parse(r.payload);
      } catch (e) {}
      return {
        id: r.id, symbol: r.symbol, tf: r.tf, direction: r.direction,
        entry: r.entry, sl: r.sl, tp1: r.tp1, tp2: r.tp2, tp3: r.tp3,
        slPlus: r.sl_plus, bePlusActive: !!r.be_plus_active, filled: !!r.filled,
        score: r.score, status: r.status, issuedAt: r.issued_at
      };
    });

    const formattedOutcomes = outcomes.map(r => ({
      id: r.id, symbol: r.symbol, tf: r.tf, direction: r.direction,
      status: r.outcome_status || r.status, reason: r.outcome_reason || '',
      at: r.outcome_at || r.issued_at, entry: r.entry, score: r.score
    }));

    return Response.json({
      ok: true,
      activeLocks: formattedActive,
      recentOutcomes: formattedOutcomes,
      outcomes: formattedOutcomes
    }, { headers: CORS });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500, headers: CORS });
  }
}

export async function onRequestPost(context) {
  const env = (context && context.env) || {};
  const req = context && context.request;

  try {
    const body = await req.json();
    const { action, lock, outcome } = body || {};

    if (!env.DB) {
      if (action === 'save_lock' && lock && lock.symbol && lock.tf) {
        const id = `${String(lock.symbol).toUpperCase()}|${lock.tf}`;
        const item = { ...lock, id, status: 'ACTIVE', issuedAt: lock.issuedAt || Date.now() };
        memoryLocks.set(id, item);
        return Response.json({ ok: true, saved: true, id, message: 'Signal lock saved in memory' }, { headers: CORS });
      }
      if (action === 'record_outcome' && outcome && outcome.symbol && outcome.tf) {
        const id = `${String(outcome.symbol).toUpperCase()}|${outcome.tf}`;
        if (memoryLocks.has(id)) {
          const l = memoryLocks.get(id);
          l.status = outcome.status || 'EXPIRED';
        }
        memoryOutcomes.unshift({ ...outcome, id, at: outcome.at || Date.now() });
        return Response.json({ ok: true, id, message: 'Outcome recorded in memory' }, { headers: CORS });
      }
      return Response.json({ ok: false, error: 'Aksi atau parameter tidak valid' }, { status: 400, headers: CORS });
    }

    await ensureTable(env.DB);
    if (action === 'save_lock' && lock && lock.symbol && lock.tf) {
      const id = `${String(lock.symbol).toUpperCase()}|${lock.tf}`;
      const payloadStr = JSON.stringify(lock);
      await env.DB.prepare(`
        INSERT INTO cloud_signal_locks (
          id, symbol, tf, direction, entry, sl, tp1, tp2, tp3, sl_plus,
          be_plus_active, filled, score, status, issued_at, payload
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
        ON CONFLICT(id) DO UPDATE SET
          direction = excluded.direction, entry = excluded.entry, sl = excluded.sl,
          tp1 = excluded.tp1, tp2 = excluded.tp2, tp3 = excluded.tp3,
          sl_plus = excluded.sl_plus, be_plus_active = excluded.be_plus_active,
          filled = excluded.filled, score = excluded.score, status = 'ACTIVE',
          issued_at = excluded.issued_at, payload = excluded.payload
      `).bind(
        id, String(lock.symbol).toUpperCase(), lock.tf, lock.direction || 'LONG',
        Number(lock.entry) || 0, Number(lock.sl) || 0, Number(lock.tp1) || 0,
        Number(lock.tp2) || null, Number(lock.tp3) || null, Number(lock.slPlus) || null,
        lock.bePlusActive ? 1 : 0, lock.filled ? 1 : 0, Number(lock.score) || 75,
        'ACTIVE', Number(lock.issuedAt) || Date.now(), payloadStr
      ).run();

      return Response.json({ ok: true, saved: true, id, message: 'Signal lock synced to cloud journal' }, { headers: CORS });
    }

    if (action === 'record_outcome' && outcome && outcome.symbol && outcome.tf) {
      const id = `${String(outcome.symbol).toUpperCase()}|${outcome.tf}`;
      await env.DB.prepare(`
        UPDATE cloud_signal_locks
        SET status = ?1, outcome_status = ?2, outcome_reason = ?3, outcome_at = ?4
        WHERE id = ?5
      `).bind(
        outcome.status || 'EXPIRED', outcome.status || 'EXPIRED',
        outcome.reason || '', Number(outcome.at) || Date.now(), id
      ).run();

      return Response.json({ ok: true, id, message: 'Outcome recorded in cloud journal' }, { headers: CORS });
    }

    return Response.json({ ok: false, error: 'Aksi atau parameter tidak valid' }, { status: 400, headers: CORS });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500, headers: CORS });
  }
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return onRequestOptions(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return onRequestGet(context);
}
