import {
  getAuthenticatedUser,
  getUserQuotaStatus,
  hashIpAddress,
  clearSessionCookie,
  parseCookies,
  SESSION_COOKIE_NAME
} from '../../lib/auth.js';
export async function onRequestGet(context) {
  const { request, env } = context;
  const user = await getAuthenticatedUser(context);
  const ipHash = await hashIpAddress(request);
  const quota = await getUserQuotaStatus(env?.DB, user, ipHash);
  const googleClientId = env?.GOOGLE_CLIENT_ID ? String(env.GOOGLE_CLIENT_ID).trim() : null;
  return new Response(
    JSON.stringify({
      ok: true,
      authenticated: Boolean(user),
      user: user
        ? {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            avatarUrl: user.avatar_url,
            role: user.role,
            vipUntil: user.vip_until
          }
        : null,
      quota,
      googleClientId
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
  const cookies = parseCookies(request);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (sessionId && env?.DB) {
    try {
      await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    } catch (_) {}
  }
  return new Response(
    JSON.stringify({ ok: true, loggedOut: true }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': clearSessionCookie(),
        'Cache-Control': 'no-store'
      }
    }
  );
}