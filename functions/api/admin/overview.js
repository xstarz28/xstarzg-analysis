import { getAuthenticatedUser, getOwnerWalletAddress, DEFAULT_OWNER_EMAILS } from '../../lib/auth.js';
import { getTodayProviderCredits } from '../../lib/db.js';
export async function onRequestGet(context) {
  const { env } = context;
  const user = await getAuthenticatedUser(context);
  if (!user || user.role !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Akses ditolak: Khusus Owner Admin.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  const db = env?.DB;
  let totalUsers = 0;
  let vipUsers = 0;
  let confirmedInvoices = 0;
  let twelveDataCreditsToday = 0;
  if (db) {
    try {
      const uRow = await db.prepare('SELECT COUNT(*) AS cnt FROM users').first();
      const vRow = await db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'vip'").first();
      const iRow = await db.prepare("SELECT COUNT(*) AS cnt FROM invoices WHERE status = 'confirmed'").first();
      totalUsers = Number(uRow?.cnt || 0);
      vipUsers = Number(vRow?.cnt || 0);
      confirmedInvoices = Number(iRow?.cnt || 0);
      twelveDataCreditsToday = await getTodayProviderCredits(db, 'twelvedata');
    } catch (_) {}
  }
  return new Response(
    JSON.stringify({
      ok: true,
      ownerConfig: {
        ownerWallet: getOwnerWalletAddress(env),
        ownerEmails: DEFAULT_OWNER_EMAILS
      },
      metrics: {
        totalUsers,
        vipUsers,
        confirmedInvoices,
        twelveDataCreditsToday
      }
    }),
    { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}
export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await getAuthenticatedUser(context);
  if (!user || user.role !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Akses ditolak: Khusus Owner Admin.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  let body = {};
  try {
    body = await request.json();
  } catch (_) {}
  if (body.action === 'grant_vip' && body.email && env?.DB) {
    const email = String(body.email).trim().toLowerCase();
    const days = Math.max(1, Number(body.durationDays || 30));
    const nowSec = Math.floor(Date.now() / 1000);
    const vipUntil = nowSec + days * 86400;
    await env.DB.prepare(
      `UPDATE users SET role = 'vip', vip_until = ?, updated_at = ? WHERE LOWER(email) = ?`
    )
      .bind(vipUntil, nowSec, email)
      .run();
    return new Response(
      JSON.stringify({ ok: true, email, vipUntil }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
  return new Response(JSON.stringify({ ok: false, error: 'Aksi admin tidak dikenali.' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}