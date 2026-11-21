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

async function getSystemSetting(env, key) {
  try {
    if (!env || !env.DB) return null;
    const row = await env.DB.prepare('SELECT value FROM system_settings WHERE key = ?1').bind(key).first();
    return row && row.value ? String(row.value).trim() : null;
  } catch (e) {
    return null;
  }
}

async function setSystemSetting(env, key, value) {
  try {
    if (!env || !env.DB) return false;
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();
    await env.DB.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(key, value, Date.now()).run();
    return true;
  } catch (e) {
    return false;
  }
}

// Otomatis daftarkan webhook ke Telegram jika belum terpasang (100% Zero Manual Configuration!)
async function ensureWebhookRegistered(request, env, botToken) {
  const token = botToken || (env && env.TELEGRAM_BOT_TOKEN);
  if (!token) return;
  try {
    const cleanToken = String(token).trim().replace(/^bot/i, '');
    const requestUrl = new URL(request.url);
    const expectedWebhookUrl = `${requestUrl.origin}/api/notify/telegram-webhook`;

    // Cek apakah webhook saat ini sudah sesuai
    const infoRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getWebhookInfo`);
    if (infoRes.ok) {
      const info = await infoRes.json();
      if (info && info.result && info.result.url === expectedWebhookUrl) {
        return; // Sudah sinkron, tidak perlu memanggil setWebhook lagi
      }
    }

    // Setel webhook otomatis ke domain website aktif saat ini
    await fetch(`https://api.telegram.org/bot${cleanToken}/setWebhook?url=${encodeURIComponent(expectedWebhookUrl)}`);
  } catch (e) {}
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

  // Resolusi bot username & token secara cerdas
  let botUsername = (env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
  let botToken = (env.TELEGRAM_BOT_TOKEN || '').trim().replace(/^bot/i, '');

  if (!botUsername && env && env.DB) {
    botUsername = (await getSystemSetting(env, 'telegram_bot_username')) || '';
  }
  if (!botToken && env && env.DB) {
    botToken = (await getSystemSetting(env, 'telegram_bot_token')) || '';
  }

  if (!botUsername && botToken) {
    try {
      const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData && meData.ok && meData.result && meData.result.username) {
          botUsername = meData.result.username;
          if (env && env.DB) {
            await setSystemSetting(env, 'telegram_bot_username', botUsername);
          }
        }
      }
    } catch (e) {}
  }

  // Otomatis sinkronkan webhook jika token tersedia
  if (botToken) {
    try { await ensureWebhookRegistered(request, env, botToken); } catch (e) {}
  }

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
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
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

    const activationToken = await signJwt({
      email: user.email,
      tier,
      isOwner: isOwner ? 1 : 0,
      isAffiliate: isAffiliate ? 1 : 0,
      expDays: isOwner ? 3650 : 35
    }, env.JWT_SECRET || 'xstarzg-2026-quant-secret');

    // Deep link hanya jika botUsername sah (bukan dummy agar tidak error "Username not found")
    const deepLink = botUsername ? `https://t.me/${botUsername}?start=${activationCode}` : null;

    return Response.json({
      ok: true,
      isVip: true,
      vip: true,
      isOwner,
      email: user.email,
      tier,
      botUsername: botUsername || null,
      botConfigured: !!botUsername,
      deepLink,
      authToken: activationToken,
      activationCode,
      linkedChatId,
      isLinked: !!linkedChatId
    }, { status: 200, headers: CORS });
  }

  // POST: Menghubungkan manual chat_id, set_bot_config (khusus owner), atau putus koneksi
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const action = body.action || 'link';

      // Jalur khusus Owner: Konfigurasi Bot Resmi langsung dari UI
      if (action === 'set_bot_config') {
        if (!isOwner) {
          return Response.json({ ok: false, error: 'Hanya Owner yang dapat mengatur bot resmi.' }, { status: 403, headers: CORS });
        }
        const newBotUsername = String(body.botUsername || '').trim().replace(/^@/, '');
        const newBotToken = String(body.botToken || '').trim().replace(/^bot/i, '');

        if (!newBotUsername && !newBotToken) {
          return Response.json({ ok: false, error: 'Masukkan username bot atau bot token.' }, { status: 400, headers: CORS });
        }

        let resolvedUsername = newBotUsername;
        if (newBotToken) {
          await setSystemSetting(env, 'telegram_bot_token', newBotToken);
          // Cek username dari getMe
          try {
            const meRes = await fetch(`https://api.telegram.org/bot${newBotToken}/getMe`);
            if (meRes.ok) {
              const meData = await meRes.json();
              if (meData && meData.ok && meData.result && meData.result.username) {
                resolvedUsername = meData.result.username;
              }
            }
          } catch (e) {}
          // Setel webhook otomatis jika token baru disimpan
          await ensureWebhookRegistered(request, env, newBotToken);
        }

        if (resolvedUsername) {
          await setSystemSetting(env, 'telegram_bot_username', resolvedUsername);
        }

        return Response.json({
          ok: true,
          botUsername: resolvedUsername,
          message: 'Pengaturan bot resmi berhasil disimpan!'
        }, { status: 200, headers: CORS });
      }

      if (action === 'unlink') {
        if (env && env.DB) {
          await env.DB.prepare('DELETE FROM telegram_subscribers WHERE email = ?1').bind(user.email).run();
        }
        return Response.json({ ok: true, isLinked: false }, { status: 200, headers: CORS });
      }

      if (action === 'test_ping') {
        let targetChatId = body.chatId;
        if (!targetChatId && env && env.DB) {
          const row = await env.DB.prepare('SELECT chat_id FROM telegram_subscribers WHERE email = ?1').bind(user.email).first();
          if (row && row.chat_id) targetChatId = row.chat_id;
        }
        if (!targetChatId) {
          return Response.json({ ok: false, error: 'Belum ada Chat ID Telegram yang terhubung.' }, { status: 400, headers: CORS });
        }
        const activeBotToken = botToken || (env && env.TELEGRAM_BOT_TOKEN);
        if (!activeBotToken) {
          return Response.json({ ok: false, error: 'Bot token belum terpasang di sistem.' }, { status: 400, headers: CORS });
        }
        const cleanToken = String(activeBotToken).trim().replace(/^bot/i, '');
        try {
          const tRes = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: targetChatId,
              text: `🔔 <b>[TES KONEKSI BOT TELEGRAM XSTARZG]</b>\n\n` +
                `Status: <b>✅ KONEKSI 100% SUKSES</b>\n` +
                `Chat ID: <b>${targetChatId}</b>\n` +
                `Akun: <b>${user.email}</b>\n\n` +
                `HP Anda berhasil terhubung! Begitu robot mendeteksi Sinyal Baru Skor Tinggi (≥ 75%) atau Proteksi SL+ (0-Risk), notifikasi akan otomatis berdering di sini!`,
              parse_mode: 'HTML'
            })
          });
          const tData = await tRes.json();
          if (tData && tData.ok) {
            return Response.json({ ok: true, message: 'Pesan tes berhasil dikirim ke Telegram Anda!' }, { status: 200, headers: CORS });
          } else {
            return Response.json({ ok: false, error: (tData && tData.description) || 'Gagal mengirim pesan ke Telegram.' }, { status: 400, headers: CORS });
          }
        } catch (err) {
          return Response.json({ ok: false, error: err.message }, { status: 500, headers: CORS });
        }
      }

      if (action === 'send_alert' || action === 'send_signal') {
        let targetChatId = body.chatId;
        if (!targetChatId && env && env.DB) {
          const row = await env.DB.prepare('SELECT chat_id FROM telegram_subscribers WHERE email = ?1').bind(user.email).first();
          if (row && row.chat_id) targetChatId = row.chat_id;
        }
        if (!targetChatId) {
          return Response.json({ ok: false, error: 'Belum ada Chat ID Telegram yang terhubung.' }, { status: 400, headers: CORS });
        }
        const activeBotToken = botToken || (env && env.TELEGRAM_BOT_TOKEN);
        if (!activeBotToken) {
          return Response.json({ ok: false, error: 'Bot token belum terpasang di sistem.' }, { status: 400, headers: CORS });
        }
        const cleanToken = String(activeBotToken).trim().replace(/^bot/i, '');
        const alertText = String(body.text || '').slice(0, 4000);
        if (!alertText) {
          return Response.json({ ok: false, error: 'Pesan text tidak boleh kosong.' }, { status: 400, headers: CORS });
        }
        try {
          const tRes = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: targetChatId,
              text: alertText,
              parse_mode: 'HTML'
            })
          });
          const tData = await tRes.json();
          if (tData && tData.ok) {
            return Response.json({ ok: true, message: 'Notifikasi sinyal terkirim ke Telegram!', ...tData }, { status: 200, headers: CORS });
          } else {
            return Response.json({ ok: false, error: (tData && tData.description) || 'Gagal mengirim pesan ke Telegram.' }, { status: 400, headers: CORS });
          }
        } catch (err) {
          return Response.json({ ok: false, error: err.message }, { status: 500, headers: CORS });
        }
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
      const activeBotToken = botToken || (env && env.TELEGRAM_BOT_TOKEN);
      if (activeBotToken) {
        try {
          const cleanToken = String(activeBotToken).trim().replace(/^bot/i, '');
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
