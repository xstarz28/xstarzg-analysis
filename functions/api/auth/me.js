import { authenticateRequest } from '../../lib/auth.js';
// Revalidasi sesi saat boot: token diverifikasi kriptografis (tanda tangan + exp),
// lalu jika D1 terpasang, entitlement VIP yang lebih panjang di database mengesampingkan
// payload token (otoritatif lintas perangkat).
async function d1VipUntil(env, email) {
  try {
    if (!env || !env.DB || !email) return 0;
    const row = await env.DB.prepare('SELECT vip_until FROM vip_entitlements WHERE email = ?1').bind(email).first();
    return row && row.vip_until ? Number(row.vip_until) : 0;
  } catch (e) { return 0; }
}
export async function onRequestGet(context) {
  const user = await authenticateRequest(context.request, context.env);
  if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const out = { email: user.email, name: user.name, tier: user.tier, vipUntil: user.vipUntil };
  const until = await d1VipUntil(context.env, out.email);
  if (until > Date.now() && until > (Number(out.vipUntil) || 0)) {
    out.tier = 'VIP';
    out.vipUntil = until;
  } else if ((until && until <= Date.now()) || (out.vipUntil && Number(out.vipUntil) <= Date.now())) {
    if (out.tier === 'VIP') {
      out.tier = 'FREE';
      out.vipUntil = null;
    }
  }
  return Response.json({ ok: true, user: out });
}
