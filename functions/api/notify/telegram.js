import { authenticateRequest } from '../../lib/auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// Fallback relay pengiriman notifikasi Telegram
// Digunakan oleh browser trader (VIP / Owner) untuk mengirim alert instan tanpa perlu mengekspos Bot Token ke client-side.
export async function onRequestPost({ request }) {
  const env = (arguments[0] && arguments[0].env) || {};
  try {
    const body = await request.json();
    let { token, chatId, text } = body || {};

    if (!token) {
      token = (env && env.TELEGRAM_BOT_TOKEN) || '';
      if (!token && env && env.DB) {
        try {
          const row = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'telegram_bot_token'").first();
          if (row && row.value) token = String(row.value).trim();
        } catch (e) {}
      }
    }

    if (!chatId) {
      try {
        const user = await authenticateRequest(request, env);
        if (user && user.email && env && env.DB) {
          const row = await env.DB.prepare('SELECT chat_id FROM telegram_subscribers WHERE email = ?1').bind(user.email).first();
          if (row && row.chat_id) chatId = row.chat_id;
        }
      } catch (e) {}
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
