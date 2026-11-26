// Endpoint login OWNER — daftar email owner & kode rahasia HANYA hidup di server
// (tidak ada di bundle JS publik, sehingga tidak bisa di-intip dari DevTools/View-Source).
import { OWNER_EMAILS, signJwt } from '../../lib/auth.js';

// Rate-limit lembut per-IP per-isolate edge (menaikkan biaya brute-force kode).
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000; // 10 menit
const MAX_TRIES = 5;              // 5 percobaan / jendela / IP
function tryAttempt(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, start: now };
  if (now - rec.start > WINDOW_MS) { rec.count = 0; rec.start = now; }
  rec.count++;
  attempts.set(ip, rec);
  if (attempts.size > 5000) { // jaga memori isolate
    for (const [k, v] of attempts) { if (now - v.start > WINDOW_MS) attempts.delete(k); }
  }
  return rec.count > MAX_TRIES;
}

// Perbandingan waktu-konstan: hash SHA-256 kedua sisi → panjang selalu sama,
// residue (^ loop) membuat timing tidak membocorkan awalan kode yang benar.
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode('\0' + String(a))),
    crypto.subtle.digest('SHA-256', enc.encode('\0' + String(b)))
  ]);
  const xa = new Uint8Array(ha), xb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ xb[i];
  return diff === 0;
}

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequestPost(context) {
  const headers = { 'Content-Type': HEADERS['Content-Type'], 'Cache-Control': 'no-store' };
  const ip = context.request.headers.get('cf-connecting-ip') || 'anon';
  if (tryAttempt(ip)) {
    return new Response(JSON.stringify({ ok: false, error: 'Terlalu banyak percobaan. Tunggu ±10 menit lalu coba lagi.' }), { status: 429, headers });
  }
  let body = {};
  try { body = await context.request.json(); } catch (e) { }
  const email = String(body.email || '').trim().toLowerCase();
  const code = String(body.code || '');
  const name = String(body.name || '').trim().slice(0, 40) || 'Owner';
  // Kode rahasia HANYA dari environment Cloudflare. Tidak ada kode default di kode
  // sumber: jika OWNER_ACCESS_CODE belum dipasang, login owner ditutup total
  // (fail-closed) — bukan diam-diam memakai kode yang bisa dibaca siapa pun.
  const expectedCode = String((context.env && context.env.OWNER_ACCESS_CODE) || '').trim();
  if (!expectedCode) {
    return new Response(JSON.stringify({ ok: false, error: 'Login owner belum dikonfigurasi di server (OWNER_ACCESS_CODE kosong).' }), { status: 503, headers });
  }
  const secret = (context.env && context.env.JWT_SECRET) || 'xstarzg-2026-quant-secret';

  const emailOk = OWNER_EMAILS.includes(email);
  const codeOk = await safeEqual(code, expectedCode);
  if (!emailOk || !codeOk) {
    // Pesan seragam: tidak membocorkan apakah email terdaftar atau kode salah
    // -> anti enumeration dari luar.
    return new Response(JSON.stringify({ ok: false, error: 'Kredensial tidak valid.' }), { status: 401, headers });
  }
  const token = await signJwt({ email, tier: 'OWNER_VIP', role: 'owner' }, secret);
  return new Response(JSON.stringify({
    ok: true,
    user: { email, name, tier: 'OWNER_VIP' },
    token
  }), { status: 200, headers });
}

export function onRequestGet() {
  return new Response(JSON.stringify({ ok: false, error: 'Method tidak didukung.' }), { status: 405, headers: HEADERS });
}
