import { authenticateRequest, OWNER_EMAILS } from '../../lib/auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequestGet(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const user = await authenticateRequest(context.request, context.env);
  if (!user || !user.email) {
    return Response.json({ ok: false, error: 'Unauthorized: invalid session.' }, { status: 401, headers: CORS });
  }

  const isOwner = user.tier === 'OWNER_VIP' || OWNER_EMAILS.includes(String(user.email).toLowerCase());
  if (!isOwner) {
    return Response.json({ ok: false, error: 'Forbidden: only the Owner may access customer data.' }, { status: 403, headers: CORS });
  }

  const env = context.env;
  let subscribers = [];
  let transactions = [];

  try {
    if (env && env.DB) {
      const subRes = await env.DB.prepare('SELECT email, vip_until, updated_at FROM vip_entitlements ORDER BY vip_until DESC LIMIT 100').all();
      subscribers = (subRes && subRes.results) ? subRes.results.map(r => {
        const until = Number(r.vip_until) || 0;
        const now = Date.now();
        const daysRemaining = Math.max(0, Math.ceil((until - now) / 86400000));
        return {
          email: r.email,
          vipUntil: until,
          vipUntilDate: until ? new Date(until).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '-',
          daysRemaining,
          isActive: until > now,
          updatedAt: r.updated_at
        };
      }) : [];

      const txRes = await env.DB.prepare('SELECT tx_hash, email, created_at FROM vip_tx ORDER BY created_at DESC LIMIT 100').all();
      transactions = (txRes && txRes.results) ? txRes.results : [];
    }
  } catch (e) {
    return Response.json({ ok: false, error: e.message || 'Database D1 query error.' }, { status: 500, headers: CORS });
  }

  return Response.json({
    ok: true,
    count: subscribers.length,
    activeCount: subscribers.filter(s => s.isActive).length,
    subscribers,
    transactions
  }, { status: 200, headers: CORS });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
