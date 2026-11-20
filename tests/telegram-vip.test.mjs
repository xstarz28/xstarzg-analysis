// tests/telegram-vip.test.mjs
// Verifikasi keamanan & fungsionalitas Telegram VIP Gating & Multi-User Broadcast Architecture

import assert from 'node:assert';
import crypto from 'node:crypto';
import { onRequest as handleLink } from '../functions/api/notify/telegram-link.js';
import { onRequest as handleWebhook } from '../functions/api/notify/telegram-webhook.js';
import { onRequest as handleSubscribers } from '../functions/api/notify/telegram-subscribers.js';
import { isOwnerEmail, isPrivilegedVip, signJwt, verifyJwt } from '../functions/lib/auth.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}\n`, err);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}\n`, err);
    failed++;
  }
}

console.log('=== RUNNING TELEGRAM VIP SECURITY & ARCHITECTURE TESTS ===\n');

// 1. Auth & Privilege Helpers
test('isOwnerEmail recognizes owner emails and rejects others', () => {
  assert.strictEqual(isOwnerEmail('sevenfoldarmy2822@gmail.com'), true);
  assert.strictEqual(isOwnerEmail('SEVENFOLDARMY2822@GMAIL.COM'), true);
  assert.strictEqual(isOwnerEmail('gilfanputra@gmail.com'), true);
  assert.strictEqual(isOwnerEmail('random_trader@gmail.com'), false);
  assert.strictEqual(isOwnerEmail(null), false);
});

test('isPrivilegedVip grants access to Owner, Affiliate, and active VIP', () => {
  // Owner email
  assert.strictEqual(isPrivilegedVip({ email: 'sevenfoldarmy2822@gmail.com', tier: 'FREE' }), true);
  // Owner tier
  assert.strictEqual(isPrivilegedVip({ email: 'owner@local', tier: 'OWNER_VIP' }), true);
  // Affiliate
  assert.strictEqual(isPrivilegedVip({ email: 'aff@local', isAffiliate: true }), true);
  assert.strictEqual(isPrivilegedVip({ email: 'aff2@local', role: 'affiliate' }), true);
  // Active VIP
  assert.strictEqual(isPrivilegedVip({ email: 'vip@local', tier: 'VIP', vipUntil: Date.now() + 86400000 }), true);
  assert.strictEqual(isPrivilegedVip({ email: 'vip2@local', tier: 'VIP' }), true); // unlimited VIP
  // Expired VIP
  assert.strictEqual(isPrivilegedVip({ email: 'vip_exp@local', tier: 'VIP', vipUntil: Date.now() - 1000 }), false);
  // Free / Guest user
  assert.strictEqual(isPrivilegedVip({ email: 'free@local', tier: 'FREE' }), false);
  assert.strictEqual(isPrivilegedVip({ email: 'guest@local', tier: 'GUEST' }), false);
  assert.strictEqual(isPrivilegedVip(null), false);
});

// Mock D1 Database
class MockD1 {
  constructor() {
    this.tables = {
      telegram_subscribers: new Map(),
      users: new Map(),
      vip_entitlements: new Map()
    };
  }

  prepare(query) {
    const self = this;
    let boundValues = [];

    return {
      bind(...args) {
        boundValues = args;
        return this;
      },
      async first() {
        if (/SELECT vip_until FROM vip_entitlements/i.test(query)) {
          const email = boundValues[0];
          return self.tables.vip_entitlements.get(email) || null;
        }
        if (/SELECT chat_id, tier, vip_until FROM telegram_subscribers/i.test(query)) {
          const email = boundValues[0];
          for (const sub of self.tables.telegram_subscribers.values()) {
            if (sub.email === email) return sub;
          }
          return null;
        }
        if (/SELECT \* FROM users WHERE email/i.test(query)) {
          const email = boundValues[0];
          return self.tables.users.get(email) || null;
        }
        return null;
      },
      async run() {
        if (/INSERT INTO telegram_subscribers/i.test(query)) {
          const [chat_id, email, tier, vip_until, is_owner, is_affiliate, registered_at] = boundValues;
          self.tables.telegram_subscribers.set(String(chat_id), {
            chat_id: String(chat_id),
            email,
            tier,
            vip_until,
            is_owner: is_owner || 0,
            is_affiliate: is_affiliate || 0,
            registered_at
          });
          return { success: true };
        }
        return { success: true };
      },
      async all() {
        if (/SELECT\s+chat_id.*FROM\s+telegram_subscribers/is.test(query)) {
          const now = boundValues[0] || Date.now();
          const results = [];
          for (const sub of self.tables.telegram_subscribers.values()) {
            if (sub.is_owner === 1 || sub.is_affiliate === 1 || (sub.vip_until && sub.vip_until > now)) {
              results.push(sub);
            }
          }
          return { results };
        }
        return { results: [] };
      }
    };
  }
}

// 2. /api/notify/telegram-link test
await asyncTest('telegram-link rejects unauthenticated or free requests with 403 Paywall', async () => {
  const env = {
    DB: new MockD1(),
    TELEGRAM_BOT_TOKEN: '12345678:TEST_TOKEN',
    JWT_SECRET: 'test_jwt_secret_123'
  };

  // Free user
  const freeToken = await signJwt({
    sub: 'free@user.com',
    email: 'free@user.com',
    tier: 'FREE'
  }, env.JWT_SECRET);

  const req = new Request('https://xstarzg.com/api/notify/telegram-link', {
    headers: { 'Authorization': `Bearer ${freeToken}` }
  });

  const res = await handleLink({ request: req, env });
  assert.strictEqual(res.status, 403);
  const data = await res.json();
  assert.strictEqual(data.upgradeRequired, true);
  assert.strictEqual(data.ok, false);
});

await asyncTest('telegram-link generates signed deep-link for VIP user', async () => {
  const env = {
    DB: new MockD1(),
    TELEGRAM_BOT_TOKEN: '12345678:TEST_TOKEN',
    TELEGRAM_BOT_USERNAME: 'xstarzg_vip_bot',
    JWT_SECRET: 'test_jwt_secret_123'
  };

  const vipToken = await signJwt({
    sub: 'trader_vip@pro.com',
    email: 'trader_vip@pro.com',
    tier: 'VIP',
    vipUntil: Date.now() + 86400000 * 30
  }, env.JWT_SECRET);

  const req = new Request('https://xstarzg.com/api/notify/telegram-link', {
    headers: { 'Authorization': `Bearer ${vipToken}` }
  });

  const res = await handleLink({ request: req, env });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.vip, true);
  assert.ok(data.deepLink.startsWith('https://t.me/xstarzg_vip_bot?start='));
  assert.ok(data.authToken.length > 20);
});

// 3. /api/notify/telegram-webhook test
await asyncTest('telegram-webhook blocks strangers with ⛔ Akses Ditolak', async () => {
  const mockDb = new MockD1();
  const env = {
    DB: mockDb,
    TELEGRAM_BOT_TOKEN: '12345678:TEST_TOKEN',
    JWT_SECRET: 'test_jwt_secret_123'
  };

  let sentMessages = [];
  // Mock global fetch to intercept Telegram API sendMessage
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url.includes('api.telegram.org')) {
      const body = JSON.parse(options.body);
      sentMessages.push(body);
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    }
    return originalFetch(url, options);
  };

  try {
    // Stranger opens bot and types /start without valid token
    const fakeUpdate = {
      message: {
        chat: { id: 999888777 },
        from: { id: 999888777, first_name: 'Hacker', username: 'free_loader' },
        text: '/start'
      }
    };

    const req = new Request('https://xstarzg.com/api/notify/telegram-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fakeUpdate)
    });

    const res = await handleWebhook({ request: req, env });
    assert.strictEqual(res.status, 200);

    // Verify rejection message was sent
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(String(sentMessages[0].chat_id), '999888777');
    assert.ok(sentMessages[0].text.includes('AKSES DITOLAK'));
    assert.ok(sentMessages[0].text.includes('Member VIP yang sudah berlangganan'));

    // Verify stranger was NOT saved to D1 subscribers
    assert.strictEqual(mockDb.tables.telegram_subscribers.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await asyncTest('telegram-webhook grants access to VIP trader with valid /start token', async () => {
  const mockDb = new MockD1();
  const env = {
    DB: mockDb,
    TELEGRAM_BOT_TOKEN: '12345678:TEST_TOKEN',
    JWT_SECRET: 'test_jwt_secret_123'
  };

  let sentMessages = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url.includes('api.telegram.org')) {
      const body = JSON.parse(options.body);
      sentMessages.push(body);
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    }
    return originalFetch(url, options);
  };

  try {
    // Create valid deep-link auth token for VIP user
    const vipEmail = 'elite_trader@vip.com';
    const validDeepLinkToken = await signJwt({
      email: vipEmail,
      tier: 'VIP',
      vipUntil: Date.now() + 86400000 * 30
    }, env.JWT_SECRET);

    const update = {
      message: {
        chat: { id: 777666555 },
        from: { id: 777666555, first_name: 'Elite', username: 'elitetrader' },
        text: `/start ${validDeepLinkToken}`
      }
    };

    const req = new Request('https://xstarzg.com/api/notify/telegram-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });

    const res = await handleWebhook({ request: req, env });
    assert.strictEqual(res.status, 200);

    // Verify confirmation message was sent
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(String(sentMessages[0].chat_id), '777666555');
    assert.ok(sentMessages[0].text.includes('BERHASIL TERVERIFIKASI'));

    // Verify subscriber was saved to D1 database!
    const saved = mockDb.tables.telegram_subscribers.get('777666555');
    assert.ok(saved);
    assert.strictEqual(saved.chat_id, '777666555');
    assert.strictEqual(saved.tier, 'VIP');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// 4. /api/notify/telegram-subscribers test (Sentinel Broadcast API)
await asyncTest('telegram-subscribers endpoint authorizes sentinel and returns active subscribers', async () => {
  const mockDb = new MockD1();
  const env = {
    DB: mockDb,
    SENTINEL_SECRET: 'sentinel_secret_key_xyz'
  };

  // Add active VIP subscriber: chat_id, email, tier, vip_until, is_owner, is_affiliate, registered_at
  await mockDb.prepare('INSERT INTO telegram_subscribers VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind('111222333', 'vip1@pro.com', 'VIP', Date.now() + 86400000, 0, 0, new Date().toISOString())
    .run();

  // Add owner subscriber
  await mockDb.prepare('INSERT INTO telegram_subscribers VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind('444555666', 'sevenfoldarmy2822@gmail.com', 'OWNER_VIP', null, 1, 0, new Date().toISOString())
    .run();

  // Add expired subscriber
  await mockDb.prepare('INSERT INTO telegram_subscribers VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind('999000111', 'expired@pro.com', 'VIP', Date.now() - 5000, 0, 0, new Date().toISOString())
    .run();

  // Request from Sentinel with valid header
  const req = new Request('https://xstarzg.com/api/notify/telegram-subscribers', {
    headers: { 'X-Sentinel-Key': 'sentinel_secret_key_xyz' }
  });

  const res = await handleSubscribers({ request: req, env });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.count, 2); // 1 active VIP + 1 Owner (expired is excluded)
  const chatIds = data.subscribers.map(s => s.chat_id);
  assert.ok(chatIds.includes('111222333'));
  assert.ok(chatIds.includes('444555666'));
  assert.ok(!chatIds.includes('999000111'));
});

console.log(`\nTELEGRAM VIP SUITE: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
