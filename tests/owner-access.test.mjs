// tests/owner-access.test.mjs
// Verifikasi login OWNER tertutup rapat: kode akses hanya dari environment,
// tidak ada kode default yang bisa dibaca dari repositori publik.

import assert from 'node:assert';
import { onRequestPost } from '../functions/api/auth/owner.js';
import { verifyJwt, OWNER_EMAILS } from '../functions/lib/auth.js';

let passed = 0;
let failed = 0;

async function chk(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}\n`, err);
    failed++;
  }
}

function ownerRequest(body, ip) {
  return new Request('https://xstarzg.example/api/auth/owner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body)
  });
}

console.log('=== RUNNING OWNER ACCESS SECURITY TESTS ===\n');

await chk('tanpa OWNER_ACCESS_CODE login owner ditutup (fail-closed, bukan kode default)', async () => {
  const res = await onRequestPost({ request: ownerRequest({ email: OWNER_EMAILS[0], code: 'Unbound28a7x' }, '10.0.0.1'), env: {} });
  assert.strictEqual(res.status, 503);
  const data = await res.json();
  assert.strictEqual(data.ok, false);
  assert.ok(/OWNER_ACCESS_CODE/.test(data.error));
});

await chk('kode default lama tidak lagi diterima saat env terpasang', async () => {
  const env = { OWNER_ACCESS_CODE: 'KodeBaruYangPanjang1234567890', JWT_SECRET: 'jwt_secret_test' };
  const res = await onRequestPost({ request: ownerRequest({ email: OWNER_EMAILS[0], code: 'Unbound28a7x' }, '10.0.0.2'), env });
  assert.strictEqual(res.status, 401);
});

await chk('email non-owner ditolak walau kode benar', async () => {
  const env = { OWNER_ACCESS_CODE: 'KodeBaruYangPanjang1234567890', JWT_SECRET: 'jwt_secret_test' };
  const res = await onRequestPost({ request: ownerRequest({ email: 'bukan.owner@gmail.com', code: env.OWNER_ACCESS_CODE }, '10.0.0.3'), env });
  assert.strictEqual(res.status, 401);
});

await chk('kode benar dari environment menerbitkan token OWNER_VIP yang sah', async () => {
  const env = { OWNER_ACCESS_CODE: 'KodeBaruYangPanjang1234567890', JWT_SECRET: 'jwt_secret_test' };
  const res = await onRequestPost({ request: ownerRequest({ email: OWNER_EMAILS[0].toUpperCase(), code: env.OWNER_ACCESS_CODE }, '10.0.0.4'), env });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.user.tier, 'OWNER_VIP');
  const payload = await verifyJwt(data.token, env.JWT_SECRET);
  assert.ok(payload);
  assert.strictEqual(payload.tier, 'OWNER_VIP');
  assert.strictEqual(payload.email, OWNER_EMAILS[0]);
});

await chk('sumber kode tidak lagi memuat kode default lama', async () => {
  const fs = await import('fs');
  const src = fs.readFileSync(new URL('../functions/api/auth/owner.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('Unbound28a7x'));
  assert.ok(src.includes('env.OWNER_ACCESS_CODE'));
});

console.log(`\nOWNER ACCESS SUITE: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
