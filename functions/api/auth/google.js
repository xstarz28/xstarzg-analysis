import { OWNER_EMAILS, signJwt } from '../../lib/auth.js';
export async function onRequestPost(context) {
  try {
    const { credential } = await context.request.json();
    if (!credential) return Response.json({ ok: false, error: 'Missing credential' }, { status: 400 });
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!verifyRes.ok) return Response.json({ ok: false, error: 'Invalid Google token' }, { status: 401 });
    const profile = await verifyRes.json();
    const email = (profile.email || '').toLowerCase();
    const name = profile.name || email.split('@')[0];
    const isOwner = OWNER_EMAILS.includes(email);
    let tier = isOwner ? 'OWNER_VIP' : 'FREE';
    if (context.env?.DB) {
      try {
        await context.env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT, tier TEXT, vip_until INTEGER, updated_at INTEGER)`
        ).run();
        const existing = await context.env.DB.prepare(`SELECT tier, vip_until FROM users WHERE email = ?`).bind(email).first();
        const nowSec = Math.floor(Date.now() / 1000);
        if (isOwner) {
          tier = 'OWNER_VIP';
        } else if (existing && existing.vip_until && existing.vip_until > nowSec) {
          tier = 'VIP';
        }
        await context.env.DB.prepare(
          `INSERT INTO users (email, name, tier, vip_until, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET name = excluded.name, tier = excluded.tier, updated_at = excluded.updated_at`
        ).bind(email, name, tier, existing?.vip_until || 0, nowSec).run();
      } catch {}
    }
    const user = { email, name, tier };
    const token = await signJwt(user, context.env?.JWT_SECRET || 'xstarzg-2026-quant-secret');
    return Response.json({ ok: true, token, user });
  } catch (e) {
    return Response.json({ ok: false, error: e.message || 'Auth error' }, { status: 500 });
  }
}
