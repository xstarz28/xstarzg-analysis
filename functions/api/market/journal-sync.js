import { authenticateRequest, isOwnerEmail, OWNER_EMAILS } from '../../lib/auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sentinel-Key',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};
const MAX_ACTIVE_AGE = 24 * 60 * 60 * 1000;
const memoryLocks = new Map();
const memoryOutcomes = [];
const memoryTombstones = new Map();

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloud_signal_locks (
      id TEXT PRIMARY KEY, symbol TEXT NOT NULL, tf TEXT NOT NULL,
      direction TEXT NOT NULL, entry REAL NOT NULL, sl REAL NOT NULL,
      tp1 REAL NOT NULL, tp2 REAL, tp3 REAL, sl_plus REAL,
      be_plus_active INTEGER DEFAULT 0, filled INTEGER DEFAULT 0,
      score INTEGER NOT NULL, status TEXT DEFAULT 'ACTIVE',
      issued_at INTEGER NOT NULL, outcome_status TEXT,
      outcome_reason TEXT, outcome_at INTEGER, payload TEXT,
      owner_email TEXT, channel TEXT DEFAULT 'sentinel'
    )
  `).run();
  for (const column of ['owner_email TEXT', "channel TEXT DEFAULT 'sentinel'"]) {
    try {
      await db.prepare(`ALTER TABLE cloud_signal_locks ADD COLUMN ${column}`).run();
    } catch (error) {
      if (!/duplicate column name/i.test(String(error && error.message || error))) throw error;
    }
  }
  await db.prepare("UPDATE cloud_signal_locks SET channel = 'sentinel' WHERE channel IS NULL").run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloud_journal_tombstones (
      owner_email TEXT PRIMARY KEY, cleared_at INTEGER NOT NULL
    )
  `).run();
}

async function resolveScope(request, env) {
  const sentinelKey = request.headers.get('X-Sentinel-Key') || '';
  if (sentinelKey && env.SENTINEL_SECRET && sentinelKey === env.SENTINEL_SECRET) {
    return { channel: 'sentinel', email: null };
  }
  const user = await authenticateRequest(request, env);
  if (user && typeof user.email === 'string' && user.email.trim()) {
    return { channel: 'user', email: user.email.trim().toLowerCase() };
  }
  return null;
}

function response(data, status = 200) {
  return Response.json(data, { status, headers: CORS });
}

function formatLock(row) {
  try {
    const parsed = row.payload ? JSON.parse(row.payload) : null;
    if (parsed && typeof parsed === 'object') {
      return {
        ...parsed,
        id: row.id,
        ownerEmail: row.owner_email || null,
        created: parsed.created || row.issued_at,
        issuedAt: parsed.issuedAt || row.issued_at,
        bePlusActive: !!(parsed.bePlusActive || row.be_plus_active),
        notifiedSlPlus: !!(parsed.notifiedSlPlus || parsed.slPlusAlerted),
        slPlusAlerted: !!(parsed.notifiedSlPlus || parsed.slPlusAlerted)
      };
    }
  } catch (e) {}
  return {
    id: row.id, symbol: row.symbol, tf: row.tf, direction: row.direction,
    ownerEmail: row.owner_email || null,
    entry: row.entry, sl: row.sl, tp1: row.tp1, tp2: row.tp2, tp3: row.tp3,
    slPlus: row.sl_plus, bePlusActive: !!row.be_plus_active, filled: !!row.filled,
    notifiedSlPlus: !!row.be_plus_active, slPlusAlerted: !!row.be_plus_active,
    score: row.score, status: row.status, issuedAt: row.issued_at, created: row.issued_at
  };
}

function scopeId(scope, symbol, tf) {
  const key = `${String(symbol).toUpperCase()}|${tf}`;
  return scope.channel === 'sentinel' ? key : `user:${scope.email}:${key}`;
}

export async function onRequestGet(context) {
  const req = context.request;
  const env = context.env || {};
  const scope = await resolveScope(req, env);
  const sentinelAuthorized = !!req.headers.get('X-Sentinel-Key') &&
    !!env.SENTINEL_SECRET && req.headers.get('X-Sentinel-Key') === env.SENTINEL_SECRET;
  // Sentinel's existing unauthenticated GET remains isolated to its own channel.
  const access = scope || { channel: 'sentinel', email: null };
  const ownerEmails = OWNER_EMAILS.map(email => email.toLowerCase());
  const now = Date.now();
  const staleThreshold = now - MAX_ACTIVE_AGE;

  if (!env.DB) {
    const locks = Array.from(memoryLocks.entries()).filter(([, lock]) =>
      sentinelAuthorized
        ? lock.channel === 'user' && isOwnerEmail(lock.email)
        : lock.channel === access.channel && lock.email === access.email
    );
    const activeLocks = locks.map(([, lock]) => lock).filter(lock =>
      lock.status === 'ACTIVE' && (lock.issuedAt || lock.created || 0) >= staleThreshold
    ).map(lock => {
      const { channel, email, ...publicLock } = lock;
      return { ...publicLock, ownerEmail: isOwnerEmail(email) ? email : null };
    });
    const outcomes = memoryOutcomes.filter(item =>
      sentinelAuthorized
        ? item.channel === 'user' && isOwnerEmail(item.email)
        : item.channel === access.channel && item.email === access.email
    ).slice(-60).map(item => {
      const { channel, email, ...publicOutcome } = item;
      return { ...publicOutcome, ownerEmail: isOwnerEmail(email) ? email : null };
    });
    return response({ ok: true, activeLocks, recentOutcomes: outcomes, outcomes });
  }

  try {
    await ensureTable(env.DB);
    const where = sentinelAuthorized
      ? `channel = 'user' AND owner_email IN (${ownerEmails.map((_, i) => `?${i + 1}`).join(', ')})`
      : access.channel === 'sentinel' ? "channel = 'sentinel'" : 'channel = ?1 AND owner_email = ?2';
    const stale = sentinelAuthorized
      ? env.DB.prepare(`UPDATE cloud_signal_locks SET status = 'EXPIRED', outcome_status = 'EXPIRED', outcome_reason = 'Stale lock auto-expired (>24h)', outcome_at = ?${ownerEmails.length + 1} WHERE ${where} AND status = 'ACTIVE' AND issued_at < ?${ownerEmails.length + 2}`)
        .bind(...ownerEmails, now, staleThreshold)
      : access.channel === 'sentinel'
      ? env.DB.prepare("UPDATE cloud_signal_locks SET status = 'EXPIRED', outcome_status = 'EXPIRED', outcome_reason = 'Stale lock auto-expired (>24h)', outcome_at = ?1 WHERE channel = 'sentinel' AND status = 'ACTIVE' AND issued_at < ?2").bind(now, staleThreshold)
      : env.DB.prepare("UPDATE cloud_signal_locks SET status = 'EXPIRED', outcome_status = 'EXPIRED', outcome_reason = 'Stale lock auto-expired (>24h)', outcome_at = ?1 WHERE channel = ?2 AND owner_email = ?3 AND status = 'ACTIVE' AND issued_at < ?4").bind(now, access.channel, access.email, staleThreshold);
    await stale.run();
    const activeQuery = sentinelAuthorized
      ? env.DB.prepare(`SELECT * FROM cloud_signal_locks WHERE ${where} AND status = 'ACTIVE' AND issued_at >= ?${ownerEmails.length + 1} ORDER BY issued_at DESC LIMIT 60`)
        .bind(...ownerEmails, staleThreshold)
      : access.channel === 'sentinel'
      ? env.DB.prepare(`SELECT * FROM cloud_signal_locks WHERE ${where} AND status = 'ACTIVE' AND issued_at >= ?1 ORDER BY issued_at DESC LIMIT 60`).bind(staleThreshold)
      : env.DB.prepare(`SELECT * FROM cloud_signal_locks WHERE ${where} AND status = 'ACTIVE' AND issued_at >= ?3 ORDER BY issued_at DESC LIMIT 60`).bind(access.channel, access.email, staleThreshold);
    const outcomeQuery = sentinelAuthorized
      ? env.DB.prepare(`SELECT * FROM cloud_signal_locks WHERE ${where} AND status != 'ACTIVE' ORDER BY outcome_at DESC LIMIT 60`)
        .bind(...ownerEmails)
      : access.channel === 'sentinel'
      ? env.DB.prepare(`SELECT * FROM cloud_signal_locks WHERE ${where} AND status != 'ACTIVE' ORDER BY outcome_at DESC LIMIT 60`)
      : env.DB.prepare(`SELECT * FROM cloud_signal_locks WHERE ${where} AND status != 'ACTIVE' ORDER BY outcome_at DESC LIMIT 60`).bind(access.channel, access.email);
    const [activeRes, outcomeRes] = await Promise.all([activeQuery.all(), outcomeQuery.all()]);
    const activeLocks = (activeRes.results || []).map(formatLock);
    const outcomes = (outcomeRes.results || []).map(row => ({
      id: row.id, symbol: row.symbol, tf: row.tf, direction: row.direction,
      status: row.outcome_status || row.status, reason: row.outcome_reason || '',
      at: row.outcome_at || row.issued_at, entry: row.entry, score: row.score
    }));
    return response({ ok: true, activeLocks, recentOutcomes: outcomes, outcomes });
  } catch (err) {
    return response({ ok: false, error: err.message }, 500);
  }
}

export async function onRequestPost(context) {
  const env = context.env || {};
  const req = context.request;
  try {
    const body = await req.json();
    const { action, lock, outcome } = body || {};
    const scope = await resolveScope(req, env);
    if (!scope) return response({ ok: false, error: 'Authentication required' }, 401);
    const ownerEmails = OWNER_EMAILS.map(email => email.toLowerCase());

    if (action === 'clear_user_journal') {
      if (scope.channel !== 'user') return response({ ok: false, error: 'User authentication required' }, 403);
      const clearedAt = Date.now();
      memoryTombstones.set(scope.email, clearedAt);
      for (const [id, item] of memoryLocks) {
        if (item.channel === 'user' && item.email === scope.email) memoryLocks.delete(id);
      }
      for (let i = memoryOutcomes.length - 1; i >= 0; i--) {
        if (memoryOutcomes[i].channel === 'user' && memoryOutcomes[i].email === scope.email) memoryOutcomes.splice(i, 1);
      }
      if (env.DB) {
        await ensureTable(env.DB);
        await env.DB.prepare(`
          INSERT INTO cloud_journal_tombstones (owner_email, cleared_at) VALUES (?1, ?2)
          ON CONFLICT(owner_email) DO UPDATE SET cleared_at = excluded.cleared_at
        `).bind(scope.email, clearedAt).run();
        await env.DB.prepare('DELETE FROM cloud_signal_locks WHERE channel = ?1 AND owner_email = ?2')
          .bind('user', scope.email).run();
      }
      return response({ ok: true, clearedAt });
    }

    if (action !== 'save_lock' && action !== 'record_outcome') {
      return response({ ok: false, error: 'Invalid action or parameters' }, 400);
    }
    if (scope.channel === 'user' && action === 'save_lock') {
      const analysis = lock && lock.analysis;
      const score = Number((analysis && (analysis.confluenceScore || analysis.convictionScore)) || (lock && lock.score));
      const alignment = analysis && analysis.topDown && analysis.topDown.alignmentStatus;
      const aligned = analysis && analysis.htfLtfAligned === true &&
        ((analysis.direction === 'LONG' && alignment === 'ALIGNED_BULLISH') ||
         (analysis.direction === 'SHORT' && alignment === 'ALIGNED_BEARISH'));
      const actionLabel = String((analysis && (analysis.action || analysis.label)) || '').trim().toUpperCase();
      const isBlockedAction = ['WAIT', 'WAIT_ZONE', 'WAIT ZONE', 'TUNGGU', 'NEUTRAL', 'UNALIGNED', 'HOLD'].includes(actionLabel) ||
        /\b(WAIT|TUNGGU|NO-TRADE|NEUTRAL|UNALIGNED|HOLD)\b/.test(actionLabel);
      const source = String((analysis && (analysis.feedSource || analysis.source)) || '').trim().toUpperCase();
      const spotOnlyMode = !!(analysis && (
        analysis.mode === 'investor' || (lock && lock.mode === 'investor') ||
        analysis.spotOnly === true || analysis.subMode === 'spot' || (lock && lock.subMode === 'spot')
      ));
      const symbolMatches = !analysis || !analysis.symbol ||
        String(analysis.symbol).toUpperCase() === String((lock && lock.symbol) || '').toUpperCase();
      const tfMatches = !analysis || !analysis.timeframe ||
        String(analysis.timeframe) === String((lock && lock.tf) || '');
      const directionMatches = !lock || !lock.direction || lock.direction === (analysis && analysis.direction);
      if (!lock || !lock.symbol || !lock.tf || !analysis || score < 78 ||
          !aligned || analysis.signalEligible !== true ||
          !['LONG', 'SHORT'].includes(analysis.direction) ||
          !symbolMatches || !tfMatches || !directionMatches ||
          isBlockedAction ||
          analysis.feedUnverified === true || analysis.__estFeed === true ||
          analysis.manualSelection !== true || !source || source === '-' ||
          /LOCAL|SEED|ESTIMATE|SYNTHETIC|FALLBACK|CALIBRATED|DEFAULT|ANCHOR/.test(source) ||
          (spotOnlyMode && analysis.direction !== 'LONG')) {
        return response({ ok: false, error: 'Signal does not meet journal admission requirements' }, 422);
      }
    }
    const item = action === 'save_lock' ? lock : outcome;
    if (!item || !item.symbol || !item.tf) return response({ ok: false, error: 'Invalid action or parameters' }, 400);
    /* ID TIDAK WAJIB. Sebelumnya lock yang diterbitkan bot (tanpa id) ditolak 400,
       sehingga jurnal cloud tidak pernah menerima posisi berjalan bot — dashboard
       menampilkan angka tapi instrumennya tidak ada. ID deterministik
       SIMBOL|TIMEFRAME dipakai untuk upsert channel sentinel. */
    const issuedAt = Number(item.issuedAt || item.at) || Date.now();
    const id = item.id ? String(item.id) : scopeId(scope, item.symbol, item.tf);

    if (!env.DB) {
      if (scope.channel === 'user' && action === 'save_lock' && issuedAt <= (memoryTombstones.get(scope.email) || 0)) {
        return response({ ok: false, error: 'Journal was cleared after this entry was created' }, 409);
      }
      if (action === 'save_lock') {
        if (scope.channel === 'sentinel' && item.id) {
          const existing = memoryLocks.get(String(item.id));
          if (existing && existing.channel === 'user' && isOwnerEmail(existing.email)) {
            const updatedLock = { ...lock, status: 'ACTIVE' };
            memoryLocks.set(existing.id, {
              ...existing, ...updatedLock, id: existing.id, channel: existing.channel, email: existing.email,
              status: 'ACTIVE', issuedAt
            });
            return response({ ok: true, id: existing.id });
          }
        }
        memoryLocks.set(id, { ...lock, id, status: 'ACTIVE', issuedAt, channel: scope.channel, email: scope.email });
      } else {
        if (scope.channel === 'sentinel' && outcome.id) {
          const existing = memoryLocks.get(String(outcome.id));
          if (existing) {
            existing.status = outcome.status || 'EXPIRED';
            memoryOutcomes.unshift({
              ...outcome, id: existing.id, at: Number(outcome.at) || Date.now(),
              channel: existing.channel, email: existing.email
            });
            return response({ ok: true, id: existing.id });
          }
        }
        const existing = memoryLocks.get(id);
        if (existing) existing.status = outcome.status || 'EXPIRED';
        memoryOutcomes.unshift({ ...outcome, id, at: Number(outcome.at) || Date.now(), channel: scope.channel, email: scope.email });
      }
      return response({ ok: true, id });
    }

    await ensureTable(env.DB);
    if (action === 'save_lock') {
      if (scope.channel === 'sentinel' && item.id) {
        const updated = await env.DB.prepare(`
          UPDATE cloud_signal_locks SET direction = ?1, entry = ?2, sl = ?3,
            tp1 = ?4, tp2 = ?5, tp3 = ?6, sl_plus = ?7, be_plus_active = ?8,
            filled = ?9, score = ?10, status = 'ACTIVE', issued_at = ?11, payload = ?12
          WHERE id = ?13 AND channel = 'user' AND owner_email IN (${ownerEmails.map((_, i) => `?${i + 14}`).join(', ')})
        `).bind(
          item.direction || 'LONG', Number(item.entry) || 0, Number(item.sl) || 0,
          Number(item.tp1) || 0, Number(item.tp2) || null, Number(item.tp3) || null,
          Number(item.slPlus) || null, item.bePlusActive ? 1 : 0, item.filled ? 1 : 0,
          Number(item.score) || 75, issuedAt, JSON.stringify({ ...item, status: 'ACTIVE' }), String(item.id), ...ownerEmails
        ).run();
        // Entri manual owner ditemukan -> selesai. Bila tidak, lock milik bot
        // tetap boleh di-upsert ke channel sentinel di bawah (jurnal bot nyata).
        if (updated.meta && updated.meta.changes) return response({ ok: true, id: String(item.id) });
      }
      if (scope.channel === 'user') {
        const tombstone = await env.DB.prepare('SELECT cleared_at FROM cloud_journal_tombstones WHERE owner_email = ?1').bind(scope.email).first();
        if (tombstone && issuedAt <= Number(tombstone.cleared_at)) {
          return response({ ok: false, error: 'Journal was cleared after this entry was created' }, 409);
        }
      }
      await env.DB.prepare(`
        INSERT INTO cloud_signal_locks (
          id, symbol, tf, direction, entry, sl, tp1, tp2, tp3, sl_plus,
          be_plus_active, filled, score, status, issued_at, payload, owner_email, channel
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'ACTIVE', ?14, ?15, ?16, ?17)
        ON CONFLICT(id) DO UPDATE SET
          direction = excluded.direction, entry = excluded.entry, sl = excluded.sl,
          tp1 = excluded.tp1, tp2 = excluded.tp2, tp3 = excluded.tp3,
          sl_plus = excluded.sl_plus, be_plus_active = excluded.be_plus_active,
          filled = excluded.filled, score = excluded.score, status = 'ACTIVE',
          issued_at = excluded.issued_at, payload = excluded.payload
      `).bind(
        id, String(item.symbol).toUpperCase(), item.tf, item.direction || 'LONG',
        Number(item.entry) || 0, Number(item.sl) || 0, Number(item.tp1) || 0,
        Number(item.tp2) || null, Number(item.tp3) || null, Number(item.slPlus) || null,
        item.bePlusActive ? 1 : 0, item.filled ? 1 : 0, Number(item.score) || 75,
        issuedAt, JSON.stringify(item), scope.channel === 'sentinel' ? null : scope.email, scope.channel
      ).run();
    } else {
      // Sentinel boleh menutup lock miliknya sendiri (channel sentinel) sekaligus
      // entri manual owner — tanpa itu, jurnal bot tidak pernah punya hasil akhir.
      const update = scope.channel === 'sentinel'
        ? env.DB.prepare(`
        UPDATE cloud_signal_locks SET status = ?1, outcome_status = ?2,
          outcome_reason = ?3, outcome_at = ?4
        WHERE id = ?5 AND (channel = 'sentinel' OR (channel = 'user' AND owner_email IN (${ownerEmails.map((_, i) => `?${i + 6}`).join(', ')})))
      `).bind(outcome.status || 'EXPIRED', outcome.status || 'EXPIRED', outcome.reason || '',
          Number(outcome.at) || Date.now(), String(outcome.id || id), ...ownerEmails)
        : env.DB.prepare(`
        UPDATE cloud_signal_locks SET status = ?1, outcome_status = ?2,
          outcome_reason = ?3, outcome_at = ?4
        WHERE id = ?5 AND channel = ?6 AND (owner_email = ?7 OR (?7 IS NULL AND owner_email IS NULL))
      `).bind(outcome.status || 'EXPIRED', outcome.status || 'EXPIRED', outcome.reason || '',
          Number(outcome.at) || Date.now(), id, scope.channel, scope.email);
      const updated = await update.run();
      if (scope.channel === 'sentinel' && outcome.id && (!updated.meta || !updated.meta.changes)) {
        return response({ ok: false, error: 'Manual owner journal entry not found' }, 404);
      }
    }
    return response({ ok: true, id });
  } catch (err) {
    return response({ ok: false, error: err.message }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return onRequestOptions(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  if (context.request.method === 'GET') return onRequestGet(context);
  return response({ ok: false, error: 'Method not allowed' }, 405);
}
