import { verifyJwt, isOwnerEmail } from '../../lib/auth.js';

async function d1VipUntil(env, email) {
  try {
    if (!env || !env.DB || !email) return 0;
    const row = await env.DB.prepare('SELECT vip_until FROM vip_entitlements WHERE email = ?1').bind(String(email).toLowerCase()).first();
    return row && row.vip_until ? Number(row.vip_until) : 0;
  } catch (e) { return 0; }
}

export async function onRequestPost({ request, env }) {
  try {
    // Jika TELEGRAM_WEBHOOK_SECRET dipasang, hanya panggilan Telegram yang membawa
    // secret_token tersebut yang diproses — request karangan orang luar ditolak.
    const hookSecret = String((env && env.TELEGRAM_WEBHOOK_SECRET) || '').trim();
    if (hookSecret && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== hookSecret) {
      return Response.json({ ok: false, error: 'Unauthorized webhook call.' }, { status: 401 });
    }
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
        try {
          await env.DB.prepare("ALTER TABLE telegram_subscribers ADD COLUMN lang TEXT DEFAULT 'en'").run();
        } catch (e) {}
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

      // Jalur B (Fallback): Cek jika argumen berupa token JWT bertanda tangan HMAC.
      // Lisensi berbayar harus MASIH BERLAKU (vipUntil di token + konfirmasi D1),
      // bukan sekadar "pernah VIP" — agar bot mati otomatis saat masa aktif habis.
      if (!verifiedUser) {
        try {
          const payload = await verifyJwt(arg, env.JWT_SECRET || 'xstarzg-2026-quant-secret');
          if (payload && payload.email) {
            const isOwner = payload.isOwner === 1 || payload.tier === 'OWNER' || payload.tier === 'OWNER_VIP' || isOwnerEmail(payload.email);
            const isAffiliate = payload.isAffiliate === 1 || payload.tier === 'AFFILIATE';
            const tokenUntil = Number(payload.vipUntil) || 0;
            const dbUntil = await d1VipUntil(env, payload.email);
            const effectiveUntil = Math.max(tokenUntil, dbUntil);
            if (isOwner || isAffiliate || effectiveUntil > Date.now()) {
              verifiedUser = {
                email: payload.email,
                tier: isOwner ? 'OWNER' : (isAffiliate ? 'AFFILIATE' : 'VIP'),
                vip_until: isOwner ? 9999999999999 : effectiveUntil,
                is_owner: isOwner ? 1 : 0,
                is_affiliate: isAffiliate ? 1 : 0
              };
            }
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

    // 2. Cek apakah pengguna mengirim alamat email (aktivasi instan via email terdaftar)
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      const email = emailMatch[1].toLowerCase().trim();
      let isVip = false;
      let tier = 'VIP';
      let vipUntil = 0;
      let isOwner = false;

      // Anti-pembajakan: email premium yang SUDAH terikat ke akun Telegram lain tidak
      // boleh diambil alih hanya dengan mengetikkan alamat emailnya. Pemilik sah harus
      // memakai deep-link 1-klik dari web (login Google) untuk memindahkan koneksi.
      if (env && env.DB) {
        try {
          const existing = await env.DB.prepare('SELECT chat_id FROM telegram_subscribers WHERE LOWER(email) = ?1 LIMIT 1').bind(email).first();
          if (existing && existing.chat_id && String(existing.chat_id) !== chatId) {
            await sendReply(
              `⛔ <b>EMAIL INI SUDAH TERHUBUNG KE AKUN TELEGRAM LAIN</b>\n\n` +
              `Demi keamanan, email <code>${email}</code> tidak bisa dipindahkan hanya dengan mengetik alamatnya.\n\n` +
              `👉 Login ke website XStarZG dengan Google, buka menu Telegram VIP, lalu tekan tombol buka bot sekali lagi untuk memindahkan koneksi ke akun Telegram Anda.`
            );
            return Response.json({ ok: true, rejected: true });
          }
        } catch (e) {}
      }

      if (isOwnerEmail(email)) {
        isVip = true;
        isOwner = true;
        tier = 'OWNER';
        vipUntil = 9999999999999;
      } else if (env && env.DB) {
        try {
          const row = await env.DB.prepare('SELECT vip_until FROM vip_entitlements WHERE email = ?1').bind(email).first();
          if (row && row.vip_until && Number(row.vip_until) > Date.now()) {
            isVip = true;
            tier = 'VIP';
            vipUntil = Number(row.vip_until);
          }
        } catch (e) {}
      }

      if (isVip) {
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
            `).bind(chatId, email, tier, vipUntil, isOwner ? 1 : 0, 0, new Date().toISOString()).run();
          } catch (e) {}
        }

        await sendReply(
          `👑 <b>SELAMAT! AKUN TELEGRAM ANDA BERHASIL TERVERIFIKASI</b>\n\n` +
          `Email Terhubung: <b>${email}</b>\n` +
          `Hak Akses: <b>${tier} MEMBER</b>\n` +
          `Status: <b>✅ AKTIF 24/7</b>\n\n` +
          `🛡️ <b>Layanan Notifikasi Terpasang:</b>\n` +
          `• Sinyal Skor Besar Institusional (≥ 75% ELITE/PRO)\n` +
          `• Live SL+ 0-Risk Alert (Pengingat geser Stop Loss ke BE+)\n\n` +
          `📱 <i>HP Anda akan otomatis berdering begitu radar cloud mendeteksi peluang di pasar. Anda tidak perlu membuka website lagi!</i>`
        );
        return Response.json({ ok: true, registered: true });
      } else {
        await sendReply(
          `⛔ <b>AKSES DITOLAK — KHUSUS MEMBER VIP XSTARZG</b>\n\n` +
          `Email <code>${email}</code> belum memiliki paket <b>Member VIP yang sudah berlangganan</b> aktif di sistem XStarZG.\n\n` +
          `👉 <b>Langkah untuk Mengaktifkan:</b>\n` +
          `1. Buka website: https://xstarzg.com\n` +
          `2. Upgrade akun Anda ke <b>VIP Pro ($29 USDT / 30 Hari)</b>\n` +
          `3. Setelah transaksi selesai, bot akan otomatis langsung aktif untuk akun Anda!`
        );
        return Response.json({ ok: true, rejected: true });
      }
    }

    // 3. Jika user hanya ketik /start biasa atau pesan lain, cek apakah chat_id sudah ada di D1
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

    // 4. User belum terdaftar / orang luar / belum bayar VIP
    await sendReply(
      `⛔ <b>AKSES DITOLAK — KHUSUS MEMBER VIP XSTARZG</b>\n\n` +
      `Mohon maaf, bot ini diproteksi eksklusif untuk <b>Member VIP yang sudah berlangganan</b>, Owner, dan Affiliate resmi.\n\n` +
      `💡 <b>Sudah Berlangganan VIP di Website?</b>\n` +
      `Cukup <b>balas dan ketikkan alamat email akun XStarZG Anda</b> ke bot ini (contoh: <code>nama@gmail.com</code>). Bot akan langsung memverifikasi status Anda dalam 1 detik!\n\n` +
      `👉 <b>Belum Berlangganan?</b>\n` +
      `Buka https://xstarzg.com dan upgrade ke VIP Pro ($29 USDT) untuk membuka bot ini.`
    );
    return Response.json({ ok: true, rejected: true });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function onRequest(context) {
  return onRequestPost(context);
}
