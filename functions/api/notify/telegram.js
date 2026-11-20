// Fallback relay pengiriman notifikasi Telegram
// Digunakan hanya jika ISP pengguna memblokir akses langsung browser ke api.telegram.org.
export async function onRequestPost({ request }) {
  try {
    const body = await request.json();
    const { token, chatId, text } = body || {};
    if (!token || !chatId || !text) {
      return Response.json({ ok: false, error: 'Parameter token, chatId, atau text tidak lengkap' }, { status: 400 });
    }
    const cleanToken = String(token).trim();
    const cleanChatId = String(chatId).trim();
    const cleanText = String(text).slice(0, 4000);

    const tgRes = await fetch(`https://api.telegram.org/bot${encodeURIComponent(cleanToken)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: cleanText,
        parse_mode: 'HTML'
      })
    });
    const data = await tgRes.json();
    return Response.json(data);
  } catch (err) {
    return Response.json({ ok: false, error: (err && err.message) || 'Gagal mengirim pesan Telegram' }, { status: 500 });
  }
}
