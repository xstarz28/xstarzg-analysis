import { authenticateRequest, isOwnerEmail, OWNER_EMAILS } from '../../lib/auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sentinel-Key',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

// Penyimpanan alarm lonceng (bell) agar tetap dipantau bot GitHub 24/7
// walau dashboard sudah ditutup. Disimpan di D1 (cloud_price_alarms);
// tanpa D1 (mode uji) dipakai Map di memori.
const memoryAlarms = new Map();

function response(data, status = 200) {
  return Response.json(data, { status, headers: CORS });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloud_price_alarms (
      id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, symbol TEXT NOT NULL,
      tf TEXT NOT NULL, kind TEXT DEFAULT 'signal', entry REAL,
      status TEXT DEFAULT 'ACTIVE', created_at INTEGER NOT NULL, payload TEXT
    )
  `).run();
}

function sentinelAuthorized(request, env) {
  const key = request.headers.get('X-Sentinel-Key') || '';
  return !!(key && env.SENTINEL_SECRET && key === env.SENTINEL_SECRET);
}

async function resolveUser(request, env) {
  try {
    const user = await authenticateRequest(request, env);
    if (user && typeof user.email === 'string' && user.email.trim()) {
      return user.email.trim().toLowerCase();
    }
  } catch (e) {}
  return null;
}

function alarmId(email, symbol, tf) {
  return `alarm:${email}:${String(symbol).toUpperCase()}|${tf}`;
}

export async function onRequestGet(context) {
  const { request, env = {} } = context || {};
  const sentinel = sentinelAuthorized(request, env);
  const email = sentinel ? null : await resolveUser(request, env);
  if (!sentinel && !email) return response({ ok: false, error: 'Authentication required' }, 401);

  if (!env.DB) {
    const alarms = Array.from(memoryAlarms.values()).filter(alarm => {
      if (alarm.status !== 'ACTIVE') return false;
      return sentinel ? isOwnerEmail(alarm.email) : alarm.email === email;
    }).map(alarm => {
      const { email: owner, ...rest } = alarm;
      return { ...rest, ownerEmail: owner };
    });
    return response({ ok: true, alarms });
  }

  try {
    await ensureTable(env.DB);
    const owners = OWNER_EMAILS.map(e => e.toLowerCase());
    const query = sentinel
      ? env.DB.prepare(`SELECT * FROM cloud_price_alarms WHERE status = 'ACTIVE' AND owner_email IN (${owners.map((_, i) => `?${i + 1}`).join(', ')})`)
        .bind(...owners)
      : env.DB.prepare("SELECT * FROM cloud_price_alarms WHERE status = 'ACTIVE' AND owner_email = ?1").bind(email);
    const res = await query.all();
    const alarms = (res.results || []).map(row => {
      let payload = null;
      try { payload = row.payload ? JSON.parse(row.payload) : null; } catch (e) {}
      return {
        ...(payload && typeof payload === 'object' ? payload : {}),
        id: row.id, symbol: row.symbol, tf: row.tf, kind: row.kind || 'signal',
        entry: row.entry, status: row.status, created: row.created_at,
        ownerEmail: row.owner_email || null
      };
    });
    return response({ ok: true, alarms });
  } catch (err) {
    return response({ ok: false, error: err.message }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env = {} } = context || {};
  const sentinel = sentinelAuthorized(request, env);
  const email = sentinel ? null : await resolveUser(request, env);
  if (!sentinel && !email) return response({ ok: false, error: 'Authentication required' }, 401);

  try {
    const body = await request.json();
    const { action, alarm } = body || {};

    if (action === 'remove') {
      if (!alarm || !alarm.symbol || !alarm.tf) return response({ ok: false, error: 'Aksi atau parameter tidak valid' }, 400);
      const id = alarmId(email, alarm.symbol, alarm.tf);
      if (!env.DB) { memoryAlarms.delete(id); return response({ ok: true, id }); }
      await ensureTable(env.DB);
      await env.DB.prepare('DELETE FROM cloud_price_alarms WHERE id = ?1 AND owner_email = ?2').bind(id, email).run();
      return response({ ok: true, id });
    }

    if (action === 'fire') {
      if (!sentinel) return response({ ok: false, error: 'Sentinel authorization required' }, 403);
      const id = String((alarm && alarm.id) || '');
      if (!id) return response({ ok: false, error: 'Alarm id required' }, 400);
      if (!env.DB) {
        const found = memoryAlarms.get(id);
        if (found) found.status = 'FIRED';
        return response({ ok: true, id });
      }
      await ensureTable(env.DB);
      await env.DB.prepare("UPDATE cloud_price_alarms SET status = 'FIRED' WHERE id = ?1").bind(id).run();
      return response({ ok: true, id });
    }

    if (action !== 'save') return response({ ok: false, error: 'Aksi atau parameter tidak valid' }, 400);
    if (!alarm || !alarm.symbol || !alarm.tf) return response({ ok: false, error: 'Aksi atau parameter tidak valid' }, 400);

    const symbol = String(alarm.symbol).toUpperCase();
    const tf = String(alarm.tf);
    const kind = alarm.kind === 'touch' ? 'touch' : 'signal';
    const entry = Number(alarm.entry) || null;
    const id = alarmId(email, symbol, tf);
    const now = Date.now();
    const payload = { ...alarm, symbol, tf, kind, id, created: now };

    if (!env.DB) {
      memoryAlarms.set(id, { id, email, symbol, tf, kind, entry, status: 'ACTIVE', created: now, payload });
      return response({ ok: true, id });
    }

    await ensureTable(env.DB);
    await env.DB.prepare(`
      INSERT INTO cloud_price_alarms (id, owner_email, symbol, tf, kind, entry, status, created_at, payload)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'ACTIVE', ?7, ?8)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind, entry = excluded.entry, status = 'ACTIVE',
        created_at = excluded.created_at, payload = excluded.payload
    `).bind(id, email, symbol, tf, kind, entry, now, JSON.stringify(payload)).run();
    return response({ ok: true, id });
  } catch (err) {
    return response({ ok: false, error: err.message }, 500);
  }
}

export async function onRequest(context) {
  if (!context || !context.request) return response({ ok: false, error: 'Invalid request' }, 400);
  if (context.request.method === 'OPTIONS') return onRequestOptions(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  if (context.request.method === 'GET') return onRequestGet(context);
  return response({ ok: false, error: 'Method not allowed' }, 405);
}
