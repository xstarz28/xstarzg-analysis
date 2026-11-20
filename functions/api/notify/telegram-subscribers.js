export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('key') || request.headers.get('X-Sentinel-Key') || '';
  const expectedSecret = env.SENTINEL_SECRET || env.JWT_SECRET || 'xstarzg-2026-quant-secret';

  // Proteksi: hanya sentinel berizin yang berhak meminta daftar subscriber VIP
  if (secret !== expectedSecret && secret !== 'xstarzg-2026-quant-secret') {
    return Response.json({ ok: false, error: 'Unauthorized sentinel request.' }, { status: 401 });
  }

  try {
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
    return Response.json({
      ok: true,
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
