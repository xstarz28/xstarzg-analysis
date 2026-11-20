import { authenticateRequest, signJwt, isOwnerEmail, isPrivilegedVip } from '../../lib/auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

async function getD1VipUntil(env, email) {
  try {
    if (!env || !env.DB || !email) return 0;
    const row = await env.DB.prepare('SELECT vip_until FROM vip_entitlements WHERE email = ?1').bind(email).first();
    return row && row.vip_until ? Number(row.vip_until) : 0;
  } catch (e) {
    return 0;
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const user = await authenticateRequest(request, env);
  if (!user || !user.email) {
    return Response.json({ ok: false, isVip: false, error: 'Silakan login terlebih dahulu.' }, { status: 401, headers: CORS });
  }

  const d1Until = await getD1VipUntil(env, user.email);
  const isVip = isPrivilegedVip(user, d1Until);
  const isOwner = user.tier === 'OWNER_VIP' || isOwnerEmail(user.email);
  const isAffiliate = !!(user.isAffiliate || user.role === 'affiliate');

  if (!isVip) {
    return Response.json({
      ok: false,
      isVip: false,
      vip: false,
      upgradeRequired: true,
      error: 'VIP_REQUIRED',
      message: 'Notifikasi Telegram 24/7 adalah fitur eksklusif Member VIP, Owner, dan Affiliate.'
    }, { status: 403, headers: CORS });
  }

  let botUsername = (env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
  if (!botUsername && env.TELEGRAM_BOT_TOKEN) {
    try {
      const cleanToken = String(env.TELEGRAM_BOT_TOKEN).trim().replace(/^bot/i, '');
      const meRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData && meData.ok && meData.result && meData.result.username) {
          botUsername = meData.result.username;
        }
      }
    } catch (e) {}
  }
  if (!botUsername) botUsername = 'xstarzg_alert_bot';

  // Pastikan tabel database siap
  if (env && env.DB) {
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS telegram_subscribers (
          chat_id       TEXT PRIMARY KEY,
          email         TEXT NOT NULL,
          tier          TEXT NOT NULL,
          vip_until     INTEGER,
          is_owner      INTEGER DEFAULT 0,
          is_affiliate  INTEGER DEFAULT 0,
          registered_at TEXT NOT NULL
        )
      `).run();
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS telegram_activations (
          code          TEXT PRIMARY KEY,
          email         TEXT NOT NULL,
          tier          TEXT NOT NULL,
          vip_until     INTEGER,
          is_owner      INTEGER DEFAULT 0,
          is_affiliate  INTEGER DEFAULT 0,
          expires_at    INTEGER NOT NULL
        )
      `).run();
    } catch (e) {}
  }

  // GET: Menghasilkan link deep-link terotentikasi & status subscriber saat ini
  if (request.method === 'GET') {
    let linkedChatId = null;
    try {
      if (env && env.DB) {
        const row = await env.DB.prepare('SELECT chat_id FROM telegram_subscribers WHERE email = ?1').bind(user.email).first();
        if (row && row.chat_id) linkedChatId = row.chat_id;
      }
    } catch (e) {}

    const tier = isOwner ? 'OWNER' : (isAffiliate ? 'AFFILIATE' : 'VIP');
    const vipUntil = isOwner ? 9999999999999 : (d1Until || user.vipUntil || 0);

    // Buat kode aktivasi ringkas (< 64 karakter, aman untuk parameter ?start= Telegram)
    const activationCode = crypto.randomUUID().replace(/-/g, '');
    if (env && env.DB) {
      try {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO telegram_activations (code, email, tier, vip_until, is_owner, is_affiliate, expires_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        `).bind(
          activationCode,
          user.email,
          tier,
          vipUntil,
          isOwner ? 1 : 0,
          isAffiliate ? 1 : 0,
          Date.now() + 86400000 // Berlaku 24 jam
        ).run();
      } catch (e) {}
    }

    // Token JWT cadangan untuk integrasi
    const activationToken = await signJwt({
      email: user.email,
      tier,
      isOwner: isOwner ? 1 : 0,
      isAffiliate: isAffiliate ? 1 : 0,
      expDays: isOwner ? 3650 : 35
    }, env.JWT_SECRET || 'xstarzg-2026-quant-secret');

    const deepLink = `https://t.me/${botUsername}?start=${activationCode}`;

    return Response.json({
      ok: true,
      isVip: true,
      vip: true,
      email: user.email,
      tier,
      botUsername,
      deepLink,
      authToken: activationToken,
      activationCode,
      linkedChatId,
      isLinked: !!linkedChatId
    }, { status: 200, headers: CORS });
  }

  // POST: Menghubungkan manual chat_id atau memutuskan koneksi
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const action = body.action || 'link';

      if (action === 'unlink') {
        if (env && env.DB) {
          await env.DB.prepare('DELETE FROM telegram_subscribers WHERE email = ?1').bind(user.email).run();
        }
        return Response.json({ ok: true, isLinked: false }, { status: 200, headers: CORS });
      }

      const chatId = String(body.chatId || '').trim().replace(/^(id\s*[:=]\s*)/i, '').replace(/\s+/g, '');
      if (!chatId || !/^-?\d+$/.test(chatId)) {
        return Response.json({ ok: false, error: 'Chat ID tidak valid (harus berupa angka UID Telegram Anda).' }, { status: 400, headers: CORS });
      }

      const tier = isOwner ? 'OWNER' : (isAffiliate ? 'AFFILIATE' : 'VIP');
      const vipUntil = isOwner ? 9999999999999 : (d1Until || user.vipUntil || 0);

      if (env && env.DB) {
        await env.DB.prepare(`
          INSERT INTO telegram_subscribers (chat_id, email, tier, vip_until, is_owner, is_affiliate, registered_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
          ON CONFLICT(chat_id) DO UPDATE SET
            email = excluded.email,
            tier = excluded.tier,
            vip_until = excluded.vip_until,
            is_owner = excluded.is_owner,
            is_affiliate = excluded.is_affiliate,
            registered_at = excluded.registered_at
        `).bind(
          chatId,
          user.email,
          tier,
          vipUntil,
          isOwner ? 1 : 0,
          isAffiliate ? 1 : 0,
          new Date().toISOString()
        ).run();
      }

      // Kirim pesan sambutan langsung ke Telegram pengguna jika bot token terpasang
      if (env && env.TELEGRAM_BOT_TOKEN) {
        try {
          const cleanToken = String(env.TELEGRAM_BOT_TOKEN).trim().replace(/^bot/i, '');
          await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `👑 <b>SELAMAT! AKUN TELEGRAM ANDA BERHASIL TERHUBUNG</b>\n\n` +
                `Email: <b>${user.email}</b>\n` +
                `Hak Akses: <b>${tier} MEMBER</b>\n` +
                `Status: <b>✅ AKTIF 24/7</b>\n\n` +
                `Notifikasi Sinyal Skor Besar Institusional (≥ 75%) dan Live SL+ 0-Risk Alert akan otomatis berdering di sini tanpa perlu membuka website!`,
              parse_mode: 'HTML'
            })
          });
        } catch (e) {}
      }

      return Response.json({
        ok: true,
        isLinked: true,
        chatId,
        message: 'Akun Telegram VIP berhasil dihubungkan!'
      }, { status: 200, headers: CORS });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500, headers: CORS });
    }
  }

  return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405, headers: CORS });
}
