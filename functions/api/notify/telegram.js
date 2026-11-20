// Fallback relay pengiriman notifikasi Telegram
// Digunakan hanya jika ISP pengguna memblokir akses langsung browser ke api.telegram.org.
export async function onRequestPost({ request }) {
  try {
    const body = await request.json();
    const { token, chatId, text } = body || {};
    if (!token || !chatId || !text) {
      return Response.json({ ok: false, error: 'Parameter token, chatId, atau text tidak lengkap' }, { status: 400 });
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
      return Response.json({ ok: false, error: errMsg, description: data && data.description, error_code: data && data.error_code });
    }
    return Response.json(data);
  } catch (err) {
    return Response.json({ ok: false, error: (err && err.message) || 'Gagal mengirim pesan Telegram' }, { status: 500 });
  }
}
