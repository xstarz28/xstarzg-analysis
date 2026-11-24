import { authenticateRequest, isOwnerEmail } from '../../lib/auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sentinel-Key',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

let memoryResetAt = 0;
const memoryLocks = new Map();
const memoryOutcomes = [];

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

async function ensureTable(db) {
  if (!db) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloud_signal_locks (
      id TEXT PRIMARY KEY, symbol TEXT NOT NULL, tf TEXT NOT NULL,
      direction TEXT NOT NULL, entry REAL NOT NULL, sl REAL NOT NULL, tp1 REAL NOT NULL,
      tp2 REAL, tp3 REAL, sl_plus REAL, be_plus_active INTEGER DEFAULT 0,
      filled INTEGER DEFAULT 0, score INTEGER, status TEXT DEFAULT 'ACTIVE',
      issued_at INTEGER NOT NULL, outcome_status TEXT, outcome_reason TEXT,
      outcome_at INTEGER, payload TEXT
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloud_journal_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      reset_at INTEGER NOT NULL DEFAULT 0
    )
  `).run();
  await db.prepare('INSERT OR IGNORE INTO cloud_journal_meta (id, reset_at) VALUES (1, 0)').run();
}

async function readResetAt(db) {
  if (!db) return memoryResetAt;
  await ensureTable(db);
  const row = await db.prepare('SELECT reset_at FROM cloud_journal_meta WHERE id = 1').first();
  return Number(row && row.reset_at) || 0;
}

function isSentinelRequest(request, env) {
  const supplied = request && request.headers ? request.headers.get('X-Sentinel-Key') || '' : '';
  const expected = env && env.SENTINEL_SECRET ? String(env.SENTINEL_SECRET) : 'xstarzg-2026-quant-secret';
  return !!supplied && supplied === expected;
}

function isVerifiedOwner(auth) {
  // Owner identity is the allow-listed email in a cryptographically verified JWT.
  // Public login intentionally issues FREE tier even for owner email, so tier/role
  // cannot be the authorization source for this endpoint.
  return !!(auth && isOwnerEmail(auth.email));
}

function response(body, status = 200) {
  return Response.json(body, { status, headers: CORS });
}

export async function onRequestGet(context) {
  const env = (context && context.env) || {};
  const now = Date.now();
  const staleThreshold = now - 24 * 3600 * 1000;

  if (!env.DB) {
    for (const [id, lock] of memoryLocks.entries()) {
      const lockTime = Number(lock.issuedAt || lock.created || 0);
      if (lock.status === 'ACTIVE' && lockTime < staleThreshold && lockTime >= memoryResetAt) {
        lock.status = 'EXPIRED';
        memoryOutcomes.unshift({
          id: lock.id || id, symbol: lock.symbol, tf: lock.tf, direction: lock.direction,
          status: 'EXPIRED', reason: 'Stale lock auto-expired (>24h)',
          at: now, entry: lock.entry, score: lock.score
        });
      }
    }
    const active = Array.from(memoryLocks.values()).filter(lock =>
      lock.status === 'ACTIVE' &&
      Number(lock.issuedAt || lock.created || 0) >= memoryResetAt &&
      Number(lock.issuedAt || lock.created || 0) >= staleThreshold
    );
    const outcomes = memoryOutcomes.filter(item => Number(item.at || 0) >= memoryResetAt).slice(0, 60);
    return response({ ok: true, resetAt: memoryResetAt, activeLocks: active, recentOutcomes: outcomes, outcomes });
  }

  await ensureTable(env.DB);
  try {
    const resetAt = await readResetAt(env.DB);
    await env.DB.prepare(`
      UPDATE cloud_signal_locks
      SET status = 'EXPIRED', outcome_status = 'EXPIRED',
          outcome_reason = 'Stale lock auto-expired (>24h)', outcome_at = ?1
      WHERE status = 'ACTIVE' AND issued_at < ?2 AND issued_at >= ?3
    `).bind(now, staleThreshold, resetAt).run();

    const activeRes = await env.DB.prepare(`
      SELECT * FROM cloud_signal_locks
      WHERE status = 'ACTIVE' AND issued_at >= ?1 AND issued_at >= ?2
      ORDER BY issued_at DESC LIMIT 60
    `).bind(staleThreshold, resetAt).all();

    const outcomeRes = await env.DB.prepare(`
      SELECT * FROM cloud_signal_locks
      WHERE status != 'ACTIVE' AND COALESCE(outcome_at, issued_at) >= ?1
      ORDER BY outcome_at DESC LIMIT 60
    `).bind(resetAt).all();

    const activeLocks = (activeRes && activeRes.results) || [];
    const outcomes = (outcomeRes && outcomeRes.results) || [];
    const formattedActive = activeLocks.map(row => {
      try {
        if (row.payload) {
          const parsed = JSON.parse(row.payload);
          if (parsed && typeof parsed === 'object') {
            return {
              ...parsed,
              created: parsed.created || row.issued_at,
              issuedAt: parsed.issuedAt || row.issued_at,
              bePlusActive: !!(parsed.bePlusActive || row.be_plus_active),
              notifiedSlPlus: !!(parsed.notifiedSlPlus || parsed.slPlusAlerted),
              slPlusAlerted: !!(parsed.notifiedSlPlus || parsed.slPlusAlerted)
            };
          }
        }
      } catch (e) {}
      return {
        id: row.id, symbol: row.symbol, tf: row.tf, direction: row.direction,
        entry: row.entry, sl: row.sl, tp1: row.tp1, tp2: row.tp2, tp3: row.tp3,
        slPlus: row.sl_plus, bePlusActive: !!row.be_plus_active, filled: !!row.filled,
        notifiedSlPlus: !!row.be_plus_active, slPlusAlerted: !!row.be_plus_active,
        score: row.score, status: row.status, issuedAt: row.issued_at, created: row.issued_at
      };
    });
    const formattedOutcomes = outcomes.map(row => ({
      id: row.id, symbol: row.symbol, tf: row.tf, direction: row.direction,
      status: row.outcome_status || row.status, reason: row.outcome_reason || '',
      at: row.outcome_at || row.issued_at, entry: row.entry, score: row.score
    }));
    return response({ ok: true, resetAt, activeLocks: formattedActive, recentOutcomes: formattedOutcomes, outcomes: formattedOutcomes });
  } catch (err) {
    return response({ ok: false, error: err.message }, 500);
  }
}

export async function onRequestPost(context) {
  const env = (context && context.env) || {};
  const req = context && context.request;
  if (!req) return response({ ok: false, error: 'Request tidak tersedia' }, 400);

  try {
    const body = await req.json();
    const { action, lock, outcome } = body || {};

    if (action === 'clear_all') {
      const auth = await authenticateRequest(req, env);
      if (!isVerifiedOwner(auth)) return response({ ok: false, error: 'Aksi reset jurnal hanya untuk owner terverifikasi.' }, 403);
      const resetAt = Date.now();
      if (!env.DB) {
        memoryLocks.clear();
        memoryOutcomes.length = 0;
        memoryResetAt = resetAt;
        return response({ ok: true, resetAt, cleared: true });
      }
      await ensureTable(env.DB);
      await env.DB.prepare('DELETE FROM cloud_signal_locks').run();
      await env.DB.prepare('UPDATE cloud_journal_meta SET reset_at = ?1 WHERE id = 1').bind(resetAt).run();
      return response({ ok: true, resetAt, cleared: true });
    }

    const sentinelRequest = isSentinelRequest(req, env);
    if (action === 'save_lock' && lock && lock.symbol && lock.tf) {
      const id = `${String(lock.symbol).toUpperCase()}|${lock.tf}`;
      const resetAt = await readResetAt(env.DB);
      const issuedAt = Number(lock.issuedAt || lock.created);
      if (!Number.isFinite(issuedAt) || issuedAt <= 0) {
        return response({ ok: false, error: 'Lock wajib memiliki timestamp penerbitan yang valid.' }, 400);
      }
      if (issuedAt < resetAt) return response({ ok: false, error: 'Lock berasal dari riwayat sebelum reset jurnal.' }, 409);

      if (!env.DB) {
        if (sentinelRequest && !memoryLocks.has(id)) {
          return response({ ok: false, error: 'Sentinel hanya boleh memperbarui lock manual yang sudah ada.' }, 403);
        }
        memoryLocks.set(id, { ...lock, id, status: 'ACTIVE', issuedAt });
        return response({ ok: true, saved: true, id, message: 'Signal lock saved in memory' });
      }

      await ensureTable(env.DB);
      if (sentinelRequest) {
        const existing = await env.DB.prepare('SELECT id FROM cloud_signal_locks WHERE id = ?1').bind(id).first();
        if (!existing) return response({ ok: false, error: 'Sentinel hanya boleh memperbarui lock manual yang sudah ada.' }, 403);
      }

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
        'ACTIVE', issuedAt, payloadStr
      ).run();
      return response({ ok: true, saved: true, id, message: 'Signal lock synced to cloud journal' });
    }

    if (action === 'record_outcome' && outcome && outcome.symbol && outcome.tf) {
      const id = `${String(outcome.symbol).toUpperCase()}|${outcome.tf}`;
      const outcomeAt = Number(outcome.at) || Date.now();
      const resetAt = await readResetAt(env.DB);
      if (outcomeAt < resetAt) return response({ ok: false, error: 'Outcome berasal dari riwayat sebelum reset jurnal.' }, 409);
      if (!env.DB) {
        if (!memoryLocks.has(id)) return response({ ok: false, error: 'Lock jurnal tidak ditemukan.' }, 404);
        memoryLocks.get(id).status = outcome.status || 'EXPIRED';
        memoryOutcomes.unshift({ ...outcome, id, at: outcomeAt });
        return response({ ok: true, id, message: 'Outcome recorded in memory' });
      }
      await ensureTable(env.DB);
      const result = await env.DB.prepare(`
        UPDATE cloud_signal_locks
        SET status = ?1, outcome_status = ?2, outcome_reason = ?3, outcome_at = ?4
        WHERE id = ?5 AND issued_at >= ?6
      `).bind(
        outcome.status || 'EXPIRED', outcome.status || 'EXPIRED',
        outcome.reason || '', outcomeAt, id, resetAt
      ).run();
      if (!result || !result.meta || !result.meta.changes) return response({ ok: false, error: 'Lock jurnal tidak ditemukan.' }, 404);
      return response({ ok: true, id, message: 'Outcome recorded in cloud journal' });
    }
    return response({ ok: false, error: 'Aksi atau parameter tidak valid' }, 400);
  } catch (err) {
    return response({ ok: false, error: err.message }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return onRequestOptions(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return onRequestGet(context);
}
