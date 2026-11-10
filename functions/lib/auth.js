export const OWNER_EMAILS = ['sevenfoldarmy2822@gmail.com', 'gilfanputra@gmail.com'];
export const VIP_WALLET_BSC = '0xB2Da154e6619A57A2B839D7845920e55Bc58A12C';
export const USDT_CONTRACT_BSC = '0x55d398326f99059fF775485246999027B3197955';
export const VIP_PRICE_USDT = 29.0;
function b64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function signJwt(payload, secret = 'xstarzg-2026-quant-secret') {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 86400 * 30 }));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${body}`));
  const sig = b64url(String.fromCharCode(...new Uint8Array(sigBuf)));
  return `${header}.${body}.${sig}`;
}
export async function verifyJwt(token, secret = 'xstarzg-2026-quant-secret') {
  try {
    const parts = (token || '').split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(`${header}.${body}`));
    if (!valid) return null;
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
export async function authenticateRequest(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  return await verifyJwt(token, env?.JWT_SECRET || 'xstarzg-2026-quant-secret');
}