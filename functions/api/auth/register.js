import { OWNER_EMAILS, signJwt } from '../../lib/auth.js';
// Login email publik: menerbitkan sesi JWT bertanda tangan server yang mengikat
// email pengguna. Verifikasi pembayaran VIP MENOLAK permintaan tanpa token ini —
// tidak ada lagi aktivasi tanpa identitas. Tier OWNER_VIP tidak pernah diberikan
// di jalur publik (khusus /api/auth/owner dengan kode rahasia).
// Jika D1 (env.DB) terpasang, entitlement VIP yang masih berlaku ikut dipulihkan
// sehingga pelanggan berpindah perangkat tidak kehilangan lisensinya.
async function d1VipUntil(env, email) {
  try {
    if (!env || !env.DB) return 0;
    const row = await env.DB.prepare('SELECT vip_until FROM vip_entitlements WHERE email = ?1').bind(email).first();
    return row && row.vip_until ? Number(row.vip_until) : 0;
  } catch (e) { return 0; }
}
export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const email = String((body && body.email) || '').trim().toLowerCase();
    const nameRaw = String((body && body.name) || '').trim();
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
      return Response.json({ ok: false, error: 'Alamat email tidak valid.' }, { status: 400 });
    }
    const name = (nameRaw || email.split('@')[0]).slice(0, 60) || email.split('@')[0];
    // Jalur publik selalu FREE (kecuali entitlement VIP aktif di D1) — email owner
    // di jalur publik tetap FREE; OWNER_VIP wajib lewat kode rahasia /api/auth/owner.
    let tier = 'FREE';
    let vipUntil = 0;
    if (!OWNER_EMAILS.includes(email)) {
      const until = await d1VipUntil(context.env, email);
      if (until > Date.now()) { tier = 'VIP'; vipUntil = until; }
    }
    const user = { email, name, tier };
    if (vipUntil) user.vipUntil = vipUntil;
    const token = await signJwt(user, context.env?.JWT_SECRET || 'xstarzg-2026-quant-secret');
    return Response.json({ ok: true, token, user });
  } catch (e) {
    return Response.json({ ok: false, error: e.message || 'Auth error' }, { status: 500 });
  }
}
