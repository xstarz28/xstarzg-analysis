const OWNER_EMAILS = ['sevenfoldarmy2822@gmail.com', 'gilfanputra@gmail.com'];
const OWNER_WALLET = '0xB2Da154e6619A57A2B839D7845920e55Bc58A12C';
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function onRequestGet(context) {
  const { request, env } = context;
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const googleClientId = env.GOOGLE_CLIENT_ID || '';
  if (token && env.DB) {
    try {
      const tokenHash = await sha256Hex(token);
      const now = Math.floor(Date.now() / 1000);
      const row = await env.DB.prepare(
        `SELECT s.token_hash, s.expires_at, u.id, u.email, u.name, u.picture, u.role, u.vip_until
         FROM sessions s JOIN users u ON s.user_id = u.id
         WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`
      )
        .bind(tokenHash, now)
        .first();
      if (row) {
        const emailLower = String(row.email || '').toLowerCase();
        const isOwner = OWNER_EMAILS.includes(emailLower) || row.role === 'owner';
        const isVip = isOwner || Number(row.vip_until || 0) > now || row.role === 'vip';
        const limit = isOwner ? 999999 : isVip ? 200 : 5;
        return new Response(
          JSON.stringify({
            ok: true,
            authenticated: true,
            googleClientId,
            ownerWallet: OWNER_WALLET,
            user: {
              id: row.id,
              email: row.email,
              name: row.name || row.email.split('@')[0],
              picture: row.picture || '',
              role: isOwner ? 'owner' : isVip ? 'vip' : 'user',
              isOwner,
              isVip,
              vipUntil: row.vip_until || 0
            },
            quota: {
              tier: isOwner ? 'OWNER ADMIN' : isVip ? 'VIP PRO' : 'GOOGLE MEMBER',
              used: 0,
              limit,
              remaining: limit
            }
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (_) {}
  }
  return new Response(
    JSON.stringify({
      ok: true,
      authenticated: false,
      googleClientId,
      ownerWallet: OWNER_WALLET,
      user: null,
      quota: {
        tier: 'GUEST',
        used: 0,
        limit: 2,
        remaining: 2
      }
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
export async function onRequestDelete(context) {
  const { request, env } = context;
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (token && env.DB) {
    try {
      const tokenHash = await sha256Hex(token);
      await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(tokenHash).run();
    } catch (_) {}
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}