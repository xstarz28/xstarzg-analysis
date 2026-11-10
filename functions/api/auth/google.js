const OWNER_EMAILS = ['sevenfoldarmy2822@gmail.com', 'gilfanputra@gmail.com'];
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const credential = String(body.credential || '').trim();
    if (!credential) {
      return new Response(JSON.stringify({ ok: false, error: 'Token Google tidak ditemukan.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // Verifikasi token ke endpoint resmi Google tokeninfo
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!verifyRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'Token Google tidak valid atau kedaluwarsa.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const payload = await verifyRes.json();
    if (env.GOOGLE_CLIENT_ID && payload.aud !== env.GOOGLE_CLIENT_ID) {
      return new Response(JSON.stringify({ ok: false, error: 'Client ID Google tidak cocok.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const email = String(payload.email || '').toLowerCase().trim();
    const sub = String(payload.sub || email);
    const name = String(payload.name || email.split('@')[0]);
    const picture = String(payload.picture || '');
    const isOwner = OWNER_EMAILS.includes(email);
    const role = isOwner ? 'owner' : 'user';
    const now = Math.floor(Date.now() / 1000);
    let userId = 1;
    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO users (google_sub, email, name, picture, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           google_sub = excluded.google_sub,
           name = excluded.name,
           picture = excluded.picture,
           role = CASE WHEN excluded.role = 'owner' THEN 'owner' ELSE users.role END,
           updated_at = excluded.updated_at`
      )
        .bind(sub, email, name, picture, role, now, now)
        .run();
      const uRow = await env.DB.prepare(`SELECT id, role, vip_until FROM users WHERE email = ? LIMIT 1`)
        .bind(email)
        .first();
      if (uRow) userId = uRow.id;
    }
    const rawSessionToken = randomHex(32);
    const tokenHash = await sha256Hex(rawSessionToken);
    const expiresAt = now + 86400 * 30;
    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`
      )
        .bind(tokenHash, userId, expiresAt, now)
        .run();
    }
    return new Response(
      JSON.stringify({
        ok: true,
        sessionToken: rawSessionToken,
        user: {
          id: userId,
          email,
          name,
          picture,
          role,
          isOwner,
          isVip: isOwner
        }
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || 'Gagal memproses login Google.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}