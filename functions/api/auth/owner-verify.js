// Verifikasi ulang sesi owner saat restore pasca-refresh: token JWT owner ditandatangani
// server; kalau tidak valid/basi, tier diturunkan ke FREE oleh klien.
import { OWNER_EMAILS, verifyJwt } from '../../lib/auth.js';

export async function onRequestPost(context) {
  let body = {};
  try { body = await context.request.json(); } catch (e) { }
  const email = String(body.email || '').trim().toLowerCase();
  const secret = (context.env && context.env.JWT_SECRET) || 'xstarzg-2026-quant-secret';
  const payload = await verifyJwt(String(body.token || ''), secret);
  const valid = !!(
    payload &&
    payload.tier === 'OWNER_VIP' &&
    payload.role === 'owner' &&
    payload.email === email &&
    OWNER_EMAILS.includes(payload.email)
  );
  return Response.json(
    valid ? { ok: true, tier: 'OWNER_VIP' } : { ok: false, error: 'Sesi owner tidak valid atau kedaluwarsa.' },
    { status: valid ? 200 : 401, headers: { 'Cache-Control': 'no-store' } }
  );
}
export function onRequestGet() {
  return Response.json({ ok: false, error: 'Method tidak didukung.' }, { status: 405 });
}
