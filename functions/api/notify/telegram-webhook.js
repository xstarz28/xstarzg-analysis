import { verifyJwt } from '../../lib/auth.js';

export async function onRequestPost({ request, env }) {
  try {
    const update = await request.json();
    const msg = update && (update.message || update.edited_message);
    if (!msg || !msg.chat || !msg.text) return Response.json({ ok: true });

    const chatId = String(msg.chat.id);
    const text = String(msg.text).trim();
    const botToken = (env.TELEGRAM_BOT_TOKEN || '').trim().replace(/^bot/i, '');

    // Fungsi helper kirim balasan dari bot
    const sendReply = async (replyHtml) => {
      if (!botToken) return;
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyHtml,
            parse_mode: 'HTML'
          })
        });
      } catch (e) {}
    };

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

    // 1. Cek apakah ini perintah aktivasi terotentikasi: /start <AUTH_CODE>
    if (text.startsWith('/start ') || text.startsWith('/start=')) {
      const arg = text.replace(/^\/start[ =]/, '').trim();
      let verifiedUser = null;

      // Jalur A: Cek dari kode aktivasi ringkas di database D1
      if (env && env.DB) {
        try {
          const actRow = await env.DB.prepare(`
            SELECT email, tier, vip_until, is_owner, is_affiliate
            FROM telegram_activations
            WHERE code = ?1 AND expires_at > ?2
          `).bind(arg, Date.now()).first();

          if (actRow && actRow.email) {
            verifiedUser = actRow;
            await env.DB.prepare('DELETE FROM telegram_activations WHERE code = ?1').bind(arg).run().catch(() => {});
          }
        } catch (e) {}
      }

      // Jalur B (Fallback): Cek jika argumen berupa token JWT bertanda tangan HMAC
      if (!verifiedUser) {
        try {
          const payload = await verifyJwt(arg, env.JWT_SECRET || 'xstarzg-2026-quant-secret');
          if (payload && payload.email) {
            const isOwner = payload.isOwner === 1 || payload.tier === 'OWNER';
            const isAffiliate = payload.isAffiliate === 1 || payload.tier === 'AFFILIATE';
            verifiedUser = {
              email: payload.email,
              tier: isOwner ? 'OWNER' : (isAffiliate ? 'AFFILIATE' : (payload.tier || 'VIP')),
              vip_until: isOwner ? 9999999999999 : (payload.vipUntil || (Date.now() + 35 * 86400000)),
              is_owner: isOwner ? 1 : 0,
              is_affiliate: isAffiliate ? 1 : 0
            };
          }
        } catch (e) {}
      }

      if (verifiedUser && verifiedUser.email) {
        // Pengguna terverifikasi sah! Daftarkan Chat ID user ke D1
        const tier = verifiedUser.tier || 'VIP';
        const vipUntil = verifiedUser.is_owner ? 9999999999999 : (verifiedUser.vip_until || 0);

        if (env && env.DB) {
          try {
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
            `).bind(chatId, verifiedUser.email, tier, vipUntil, verifiedUser.is_owner ? 1 : 0, verifiedUser.is_affiliate ? 1 : 0, new Date().toISOString()).run();
          } catch (e) {}
        }

        await sendReply(
          `👑 <b>SELAMAT! AKUN TELEGRAM ANDA BERHASIL TERVERIFIKASI</b>\n\n` +
          `Email Terhubung: <b>${verifiedUser.email}</b>\n` +
          `Hak Akses: <b>${tier} MEMBER</b>\n` +
          `Status: <b>✅ AKTIF 24/7</b>\n\n` +
          `🛡️ <b>Layanan Notifikasi Terpasang:</b>\n` +
          `• Sinyal Skor Besar Institusional (≥ 75% ELITE/PRO)\n` +
          `• Live SL+ 0-Risk Alert (Pengingat geser Stop Loss ke BE+)\n\n` +
          `📱 <i>HP Anda akan otomatis berdering begitu radar cloud mendeteksi peluang di pasar. Anda tidak perlu membuka website lagi!</i>`
        );
        return Response.json({ ok: true, registered: true });
      }
    }

    // 2. Jika user hanya ketik /start biasa atau pesan lain, cek apakah chat_id sudah ada di D1
    let subscriber = null;
    if (env && env.DB) {
      try {
        subscriber = await env.DB.prepare('SELECT email, tier, vip_until, is_owner, is_affiliate FROM telegram_subscribers WHERE chat_id = ?1').bind(chatId).first();
      } catch (e) {}
    }

    if (subscriber && (subscriber.is_owner || subscriber.is_affiliate || Number(subscriber.vip_until) > Date.now())) {
      await sendReply(
        `👑 <b>XSTARZG VIP SENTINEL BOT (AKTIF)</b>\n\n` +
        `Halo! Akun Telegram Anda terdaftar sebagai <b>${subscriber.tier}</b> (<code>${subscriber.email}</code>).\n\n` +
        `Mesin pemantau 24/7 di cloud aktif memindai pasar. Anda akan menerima notifikasi otomatis di sini saat setup skor tinggi atau SL+ terpicu.`
      );
      return Response.json({ ok: true, existing: true });
    }

    // 3. User luar / asing / belum bayar VIP -> BLOKIR DENGAN AMAN!
    await sendReply(
      `⛔ <b>AKSES DITOLAK — KHUSUS MEMBER VIP XSTARZG</b>\n\n` +
      `Mohon maaf, bot ini diproteksi eksklusif untuk <b>Member VIP yang sudah berlangganan</b>, Owner, dan Affiliate resmi.\n\n` +
      `Akun Telegram Anda belum terhubung dengan lisensi VIP aktif.\n\n` +
      `👉 <b>Cara Aktivasi Resmi:</b>\n` +
      `1. Buka terminal XStarZG: https://xstarzg.com\n` +
      `2. Upgrade akun Anda ke <b>VIP Pro ($29 USDT)</b>\n` +
      `3. Klik tombol <b>"✈️ Notif Telegram 24/7 (VIP)"</b> di dashboard untuk mendapatkan tautan aktivasi resmi bot Anda.`
    );
    return Response.json({ ok: true, rejected: true });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function onRequest(context) {
  return onRequestPost(context);
}
