export const DEFAULT_OWNER_WALLET = '0xB2Da154e6619A57A2B839D7845920e55Bc58A12C';
export const DEFAULT_OWNER_EMAILS = [
  'sevenfoldarmy2822@gmail.com',
  'gilfanputra@gmail.com'
];
export const FREE_ANALYSIS_QUOTA_LIMIT = 2;
export const SESSION_COOKIE_NAME = 'xstarzg_sid';
export const SESSION_TTL_SEC = 60 * 60 * 24 * 30;
let cachedGoogleJwks = null;
let cachedGoogleJwksExpiresAt = 0;
export function getOwnerWalletAddress(env) {
  const raw = (env && env.OWNER_WALLET_ADDRESS) ? String(env.OWNER_WALLET_ADDRESS).trim() : '';
  if (/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    return raw;
  }
  return DEFAULT_OWNER_WALLET;
}
export function isOwnerAdminEmail(email, env) {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  const allowed = new Set(DEFAULT_OWNER_EMAILS.map((e) => e.toLowerCase()));
  if (env && env.OWNER_ADMIN_EMAIL) {
    String(env.OWNER_ADMIN_EMAIL)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .forEach((e) => allowed.add(e));
  }
  return allowed.has(normalized);
}
export async function hashIpAddress(request) {
  const rawIp =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '0.0.0.0';
  const data = new TextEncoder().encode(`xstarzg_salt_2026_${rawIp}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
function base64UrlToUint8Array(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}
function decodeJwtPart(part) {
  const bytes = base64UrlToUint8Array(part);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}
async function fetchGoogleJwks() {
  const now = Date.now();
  if (cachedGoogleJwks && now < cachedGoogleJwksExpiresAt) {
    return cachedGoogleJwks;
  }
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs', {
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) {
    throw new Error(`Google JWKS fetch failed with HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.keys)) {
    throw new Error('Invalid Google JWKS payload');
  }
  cachedGoogleJwks = data.keys;
  cachedGoogleJwksExpiresAt = now + 3600 * 1000;
  return cachedGoogleJwks;
}
export async function verifyGoogleIdToken(idToken, env) {
  if (!env?.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID belum dikonfigurasi di server');
  }
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Missing Google ID token');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT structure');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeJwtPart(headerB64);
  const payload = decodeJwtPart(payloadB64);
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported JWT algorithm or missing kid');
  }
  const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
  if (!validIssuers.includes(payload.iss)) {
    throw new Error('Invalid JWT issuer');
  }
  if (payload.aud !== env.GOOGLE_CLIENT_ID) {
    throw new Error('JWT audience mismatch');
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || Number(payload.exp) < nowSec - 30) {
    throw new Error('Google ID token has expired');
  }
  if (payload.email_verified !== true) {
    throw new Error('Google email is not verified');
  }
  const jwks = await fetchGoogleJwks();
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new Error('Matching Google JWK kid not found');
  }
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signedContent = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlToUint8Array(signatureB64);
  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBytes,
    signedContent
  );
  if (!isValid) {
    throw new Error('Invalid Google JWT cryptographic signature');
  }
  return {
    sub: String(payload.sub),
    email: String(payload.email).trim().toLowerCase(),
    name: String(payload.name || payload.email.split('@')[0]),
    picture: String(payload.picture || ''),
    emailVerified: Boolean(payload.email_verified)
  };
}
export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}
export function createSessionCookie(sessionId, maxAgeSec = SESSION_TTL_SEC) {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}
export function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
export async function getAuthenticatedUser(context) {
  const { request, env } = context;
  if (!env || !env.DB) return null;
  const cookies = parseCookies(request);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  try {
    const row = await env.DB.prepare(
      `SELECT s.id AS session_id, s.expires_at,
              u.id, u.google_sub, u.email, u.display_name, u.avatar_url, u.role, u.vip_until
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?
       LIMIT 1`
    )
      .bind(sessionId, nowSec)
      .first();
    if (!row) return null;
    let effectiveRole = row.role || 'free';
    const vipUntil = Number(row.vip_until || 0);
    if (isOwnerAdminEmail(row.email, env)) {
      effectiveRole = 'admin';
      if (row.role !== 'admin') {
        await env.DB.prepare(`UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?`)
          .bind(nowSec, row.id)
          .run();
      }
    } else if (effectiveRole === 'vip' && vipUntil <= nowSec) {
      effectiveRole = 'free';
      await env.DB.prepare(`UPDATE users SET role = 'free', updated_at = ? WHERE id = ?`)
        .bind(nowSec, row.id)
        .run();
    }
    return {
      id: row.id,
      google_sub: row.google_sub,
      email: row.email,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      role: effectiveRole,
      vip_until: vipUntil,
      session_id: row.session_id
    };
  } catch (_) {
    return null;
  }
}
export async function getUserQuotaStatus(db, user, ipHash = '') {
  const nowSec = Math.floor(Date.now() / 1000);
  if (user) {
    const isVipActive = user.role === 'vip' && Number(user.vip_until || 0) > nowSec;
    if (user.role === 'admin' || isVipActive) {
      return {
        unlimited: true,
        limit: null,
        used: 0,
        remaining: null,
        role: user.role,
        vipUntil: Number(user.vip_until || 0)
      };
    }
  }
  if (!db) {
    return {
      unlimited: false,
      limit: FREE_ANALYSIS_QUOTA_LIMIT,
      used: 0,
      remaining: FREE_ANALYSIS_QUOTA_LIMIT,
      role: user?.role || 'free',
      vipUntil: 0
    };
  }
  try {
    const targetUserId = user?.id || (ipHash ? `guest_${ipHash}` : '');
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS used_count
         FROM quota_logs
         WHERE user_id = ? OR (? != '' AND ip_hash = ?)`
      )
      .bind(targetUserId, ipHash, ipHash)
      .first();
    const used = Number(row?.used_count || 0);
    const remaining = Math.max(0, FREE_ANALYSIS_QUOTA_LIMIT - used);
    return {
      unlimited: false,
      limit: FREE_ANALYSIS_QUOTA_LIMIT,
      used,
      remaining,
      role: user?.role || 'free',
      vipUntil: Number(user?.vip_until || 0)
    };
  } catch (_) {
    return {
      unlimited: false,
      limit: FREE_ANALYSIS_QUOTA_LIMIT,
      used: 0,
      remaining: FREE_ANALYSIS_QUOTA_LIMIT,
      role: user?.role || 'free',
      vipUntil: 0
    };
  }
}