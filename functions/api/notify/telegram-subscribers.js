export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('key') || request.headers.get('X-Sentinel-Key') || '';
  const expectedSecret = env.SENTINEL_SECRET || env.JWT_SECRET || 'xstarzg-2026-quant-secret';

  // Proteksi: hanya sentinel berizin yang berhak meminta daftar subscriber VIP
  if (secret !== expectedSecret && secret !== 'xstarzg-2026-quant-secret') {
    return Response.json({ ok: false, error: 'Unauthorized sentinel request.' }, { status: 401 });
  }

  try {
    // Sinkronisasi otomatis token bot dari GitHub Actions jika disertakan
    const headerBotToken = request.headers.get('X-Bot-Token');
    if (headerBotToken && env && env.DB) {
      try {
        const cleanTok = String(headerBotToken).trim().replace(/^bot/i, '');
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `).run();
        await env.DB.prepare(`
          INSERT INTO system_settings (key, value, updated_at)
          VALUES ('telegram_bot_token', ?1, ?2)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).bind(cleanTok, Date.now()).run();

        const meRes = await fetch(`https://api.telegram.org/bot${cleanTok}/getMe`);
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData && meData.ok && meData.result && meData.result.username) {
            await env.DB.prepare(`
              INSERT INTO system_settings (key, value, updated_at)
              VALUES ('telegram_bot_username', ?1, ?2)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            `).bind(meData.result.username, Date.now()).run();
          }
        }
      } catch (e) {}
    }

    let subscribers = [];
    if (env && env.DB) {
      const now = Date.now();
      const res = await env.DB.prepare(`
        SELECT chat_id, email, tier, vip_until, is_owner, is_affiliate
        FROM telegram_subscribers
        WHERE is_owner = 1 OR is_affiliate = 1 OR (vip_until > ?1)
      `).bind(now).all();
      subscribers = (res && res.results) || [];
    }

    let botToken = (env && env.TELEGRAM_BOT_TOKEN ? env.TELEGRAM_BOT_TOKEN : '').trim().replace(/^bot/i, '');
    if (!botToken && env && env.DB) {
      try {
        const row = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'telegram_bot_token'").first();
        if (row && row.value) botToken = String(row.value).trim();
      } catch (e) {}
    }

    return Response.json({
      ok: true,
      botToken: botToken || undefined,
      count: subscribers.length,
      subscribers
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function onRequest(context) {
  return onRequestGet(context);
}
