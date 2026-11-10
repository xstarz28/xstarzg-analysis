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
    const user = { email, name, tier };
    const token = await signJwt(user, context.env?.JWT_SECRET || 'xstarzg-2026-quant-secret');
    return Response.json({ ok: true, token, user });
  } catch (e) {
    return Response.json({ ok: false, error: e.message || 'Auth error' }, { status: 500 });
  }
}