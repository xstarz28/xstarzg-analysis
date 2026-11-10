import {
  verifyGoogleIdToken,
  isOwnerAdminEmail,
  createSessionCookie,
  getUserQuotaStatus,
  hashIpAddress,
  SESSION_TTL_SEC
} from '../../lib/auth.js';
export async function onRequestGet(context) {
  const { env } = context;
  const clientId = env?.GOOGLE_CLIENT_ID ? String(env.GOOGLE_CLIENT_ID).trim() : null;
  return new Response(
    JSON.stringify({
      ok: true,
      configured: Boolean(clientId),
      googleClientId: clientId
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    }
  );
}
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env || !env.DB) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Database D1 belum terhubung pada environment ini.' }),
      { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
  let body = {};
  try {
    body = await request.json();
  } catch (_) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Payload JSON tidak valid.' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
  if (!body.credential || typeof body.credential !== 'string') {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Token Google ID (credential) wajib disertakan untuk autentikasi.'
      }),
      { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
  let profile;
  try {
    profile = await verifyGoogleIdToken(body.credential, env);
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Verifikasi Google ID Token gagal: ${err.message || 'Token tidak sah'}`
      }),
      { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const isOwner = isOwnerAdminEmail(profile.email, env);
  try {
    const existing = await env.DB.prepare(
      `SELECT id, google_sub, email, display_name, avatar_url, role, vip_until
       FROM users
       WHERE google_sub = ? OR email = ?
       LIMIT 1`
    )
      .bind(profile.sub, profile.email)
      .first();
    let userId;
    let role = isOwner ? 'admin' : 'free';
    let vipUntil = 0;
    if (existing) {
      userId = existing.id;
      vipUntil = Number(existing.vip_until || 0);
      if (isOwner) {
        role = 'admin';
      } else if (existing.role === 'vip' && vipUntil > nowSec) {
        role = 'vip';
      } else if (existing.role === 'admin') {
        role = isOwner ? 'admin' : 'free';
      }
      await env.DB.prepare(
        `UPDATE users
         SET google_sub = ?, email = ?, display_name = ?, avatar_url = ?, role = ?, updated_at = ?
         WHERE id = ?`
      )
        .bind(profile.sub, profile.email, profile.name, profile.picture, role, nowSec, userId)
        .run();
    } else {
      userId = `usr_${crypto.randomUUID().replace(/-/g, '')}`;
      await env.DB.prepare(
        `INSERT INTO users (id, google_sub, email, display_name, avatar_url, role, vip_until, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
      )
        .bind(userId, profile.sub, profile.email, profile.name, profile.picture, role, nowSec, nowSec)
        .run();
    }
    const sessionId = `ses_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
    const expiresAt = nowSec + SESSION_TTL_SEC;
    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`
    )
      .bind(sessionId, userId, expiresAt, nowSec)
      .run();
    const userObj = {
      id: userId,
      google_sub: profile.sub,
      email: profile.email,
      display_name: profile.name,
      avatar_url: profile.picture,
      role,
      vip_until: vipUntil
    };
    const ipHash = await hashIpAddress(request);
    const quota = await getUserQuotaStatus(env.DB, userObj, ipHash);
    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          id: userObj.id,
          email: userObj.email,
          displayName: userObj.display_name,
          avatarUrl: userObj.avatar_url,
          role: userObj.role,
          vipUntil: userObj.vip_until
        },
        quota
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie': createSessionCookie(sessionId, SESSION_TTL_SEC),
          'Cache-Control': 'no-store'
        }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Gagal menyimpan sesi pengguna: ${err.message || 'Database error'}`
      }),
      { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
}