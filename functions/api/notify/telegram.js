import { authenticateRequest, isPrivilegedVip } from '../../lib/auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sentinel-Key',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

async function d1VipUntil(env, email) {
  try {
    if (!env || !env.DB || !email) return 0;
    const row = await env.DB.prepare('SELECT vip_until FROM vip_entitlements WHERE email = ?1').bind(email).first();
    return row && row.vip_until ? Number(row.vip_until) : 0;
  } catch (e) { return 0; }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// Fallback relay pengiriman notifikasi Telegram.
// Eksklusif: hanya Member VIP/Owner/Affiliate yang login, atau Sentinel 24/7 dengan
// SENTINEL_SECRET, yang boleh memakai relay ini. Tanpa gerbang ini siapa pun bisa
// memakai bot resmi untuk mengirim pesan palsu ke chat ID mana pun.
export async function onRequestPost({ request, env }) {
  const e = env || {};
  try {
    const sentinelKey = request.headers.get('X-Sentinel-Key') || '';
    const isSentinel = !!(e.SENTINEL_SECRET && sentinelKey === e.SENTINEL_SECRET);
    if (!isSentinel) {
      const user = await authenticateRequest(request, e);
      if (!user || !user.email) {
        return Response.json({ ok: false, error: 'Silakan login terlebih dahulu.' }, { status: 401, headers: CORS });
      }
      const until = await d1VipUntil(e, user.email);
      if (!isPrivilegedVip(user, until)) {
        return Response.json({ ok: false, error: 'VIP_REQUIRED', message: 'Notifikasi Telegram eksklusif Member VIP yang aktif.' }, { status: 403, headers: CORS });
      }
    }
    const body = await request.json();
    let { token, chatId, text } = body || {};

    if (!token) {
      token = (e && e.TELEGRAM_BOT_TOKEN) || '';
      if (!token && e && e.DB) {
        try {
          const row = await e.DB.prepare("SELECT value FROM system_settings WHERE key = 'telegram_bot_token'").first();
          if (row && row.value) token = String(row.value).trim();
        } catch (err) {}
      }
    }

    if (!chatId && !isSentinel) {
      try {
        const user = await authenticateRequest(request, e);
        if (user && user.email && e && e.DB) {
          const row = await e.DB.prepare('SELECT chat_id FROM telegram_subscribers WHERE email = ?1').bind(user.email).first();
          if (row && row.chat_id) chatId = row.chat_id;
        }
      } catch (err) {}
    }

    if (!token || !chatId || !text) {
      return Response.json({ ok: false, error: 'Parameter token, chatId, atau text tidak lengkap' }, { status: 400, headers: CORS });
    }
    const cleanToken = String(token).trim().replace(/^bot/i, '');
    const cleanChatId = String(chatId).trim().replace(/^(id\s*[:=]\s*)/i, '').replace(/\s+/g, '');
    const cleanText = String(text).slice(0, 4000);

    const tgRes = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: cleanText,
        parse_mode: 'HTML'
      })
    });
    const data = await tgRes.json();
    if (!tgRes.ok || !data.ok) {
      const errMsg = (data && (data.description || data.error)) || `HTTP ${tgRes.status}`;
      return Response.json({ ok: false, error: errMsg, description: data && data.description, error_code: data && data.error_code }, { status: 400, headers: CORS });
    }
    return Response.json({ ...data, chatId: cleanChatId }, { status: 200, headers: CORS });
  } catch (err) {
    return Response.json({ ok: false, error: (err && err.message) || 'Gagal mengirim pesan Telegram' }, { status: 500, headers: CORS });
  }
}
