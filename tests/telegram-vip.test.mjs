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
      telegram_activations: new Map(),
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
        if (/SELECT chat_id FROM telegram_subscribers/i.test(query) || /SELECT chat_id, tier, vip_until FROM telegram_subscribers/i.test(query)) {
          const email = boundValues[0];
          for (const sub of self.tables.telegram_subscribers.values()) {
            if (sub.email === email) return sub;
          }
          return null;
        }
        if (/SELECT\s+email.*FROM\s+telegram_activations/is.test(query)) {
          const code = boundValues[0];
          const now = boundValues[1] || Date.now();
          const act = self.tables.telegram_activations.get(code);
          if (act && act.expires_at > now) return act;
          return null;
        }
        if (/SELECT \* FROM users WHERE email/i.test(query)) {
          const email = boundValues[0];
          return self.tables.users.get(email) || null;
        }
        return null;
      },
      async run() {
        if (/INSERT.*INTO telegram_activations/i.test(query)) {
          const [code, email, tier, vip_until, is_owner, is_affiliate, expires_at] = boundValues;
          self.tables.telegram_activations.set(code, {
            code, email, tier, vip_until, is_owner, is_affiliate, expires_at
          });
          return { success: true };
        }
        if (/DELETE FROM telegram_activations/i.test(query)) {
          const code = boundValues[0];
          self.tables.telegram_activations.delete(code);
          return { success: true };
        }
        if (/INSERT.*INTO telegram_subscribers/i.test(query)) {
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
  assert.ok(data.activationCode.length === 32);
  assert.ok(data.activationCode.length <= 64); // Strict Telegram deep link parameter requirement
});

await asyncTest('telegram-link auto-discovers bot username from getMe when TELEGRAM_BOT_USERNAME is not set', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('api.telegram.org') && url.includes('/getMe')) {
      return new Response(JSON.stringify({
        ok: true,
        result: { username: 'auto_discovered_signals_bot' }
      }), { status: 200 });
    }
    return originalFetch(url);
  };

  try {
    const env = {
      DB: new MockD1(),
      TELEGRAM_BOT_TOKEN: '12345678:BOT_TOKEN_XYZ',
      JWT_SECRET: 'test_jwt_secret_123'
    };

    const vipToken = await signJwt({
      email: 'owner@local.com',
      tier: 'OWNER_VIP'
    }, env.JWT_SECRET);

    const req = new Request('https://xstarzg.com/api/notify/telegram-link', {
      headers: { 'Authorization': `Bearer ${vipToken}` }
    });

    const res = await handleLink({ request: req, env });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.botUsername, 'auto_discovered_signals_bot');
    assert.ok(data.deepLink.startsWith('https://t.me/auto_discovered_signals_bot?start='));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await asyncTest('manual chat ID link saves subscriber and dispatches confirmation message', async () => {
  const mockDb = new MockD1();
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
    const env = {
      DB: mockDb,
      TELEGRAM_BOT_TOKEN: '12345678:TEST_TOKEN',
      JWT_SECRET: 'test_jwt_secret_123'
    };

    const vipToken = await signJwt({
      email: 'sevenfoldarmy2822@gmail.com',
      tier: 'OWNER_VIP'
    }, env.JWT_SECRET);

    const req = new Request('https://xstarzg.com/api/notify/telegram-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vipToken}` },
      body: JSON.stringify({ chatId: '1287273759' })
    });

    const res = await handleLink({ request: req, env });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.chatId, '1287273759');

    // Subscriber is recorded
    const saved = mockDb.tables.telegram_subscribers.get('1287273759');
    assert.ok(saved);
    assert.strictEqual(saved.chat_id, '1287273759');
    assert.strictEqual(saved.email, 'sevenfoldarmy2822@gmail.com');

    // Bot sent confirmation message to HP
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(String(sentMessages[0].chat_id), '1287273759');
    assert.ok(sentMessages[0].text.includes('BERHASIL TERHUBUNG'));
  } finally {
    globalThis.fetch = originalFetch;
  }
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

await asyncTest('telegram-webhook grants access via short activation code from deep link', async () => {
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
    const actCode = 'abc123def45678901234567890abcdef';
    // Insert code to activations table
    await mockDb.prepare('INSERT INTO telegram_activations VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(actCode, 'vip_mobile@pro.com', 'VIP', Date.now() + 86400000 * 30, 0, 0, Date.now() + 86400000)
      .run();

    const update = {
      message: {
        chat: { id: 888999111 },
        from: { id: 888999111, first_name: 'MobileTrader', username: 'mobiletrader' },
        text: `/start ${actCode}`
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
    assert.strictEqual(String(sentMessages[0].chat_id), '888999111');
    assert.ok(sentMessages[0].text.includes('BERHASIL TERVERIFIKASI'));

    // Verify subscriber was saved to D1 database!
    const saved = mockDb.tables.telegram_subscribers.get('888999111');
    assert.ok(saved);
    assert.strictEqual(saved.chat_id, '888999111');
    assert.strictEqual(saved.email, 'vip_mobile@pro.com');

    // Code is deleted after use
    assert.strictEqual(mockDb.tables.telegram_activations.has(actCode), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await asyncTest('telegram-webhook grants access when user types their registered VIP email directly in chat', async () => {
  const mockDb = new MockD1();
  const env = {
    DB: mockDb,
    TELEGRAM_BOT_TOKEN: '12345678:TEST_TOKEN',
    JWT_SECRET: 'test_jwt_secret_123'
  };

  // Register user in vip_entitlements
  mockDb.tables.vip_entitlements.set('paid_customer@gmail.com', {
    vip_until: Date.now() + 86400000 * 30
  });

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
    // User opens bot and simply types: "Halo min, email saya paid_customer@gmail.com"
    const update = {
      message: {
        chat: { id: 555444333 },
        from: { id: 555444333, first_name: 'Customer' },
        text: 'Halo min, email saya paid_customer@gmail.com'
      }
    };

    const req = new Request('https://xstarzg.com/api/notify/telegram-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });

    const res = await handleWebhook({ request: req, env });
    assert.strictEqual(res.status, 200);

    // Bot verifies and confirms
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(String(sentMessages[0].chat_id), '555444333');
    assert.ok(sentMessages[0].text.includes('BERHASIL TERVERIFIKASI'));
    assert.ok(sentMessages[0].text.includes('paid_customer@gmail.com'));

    // User is saved to telegram_subscribers
    const saved = mockDb.tables.telegram_subscribers.get('555444333');
    assert.ok(saved);
    assert.strictEqual(saved.email, 'paid_customer@gmail.com');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await asyncTest('telegram-webhook rejects stranger typing non-VIP email', async () => {
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
    // Stranger tries to type a free / random email
    const update = {
      message: {
        chat: { id: 1122334455 },
        from: { id: 1122334455, first_name: 'Stranger' },
        text: 'email saya stranger@free.com'
      }
    };

    const req = new Request('https://xstarzg.com/api/notify/telegram-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });

    const res = await handleWebhook({ request: req, env });
    assert.strictEqual(res.status, 200);

    // Bot rejects
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(String(sentMessages[0].chat_id), '1122334455');
    assert.ok(sentMessages[0].text.includes('AKSES DITOLAK'));
    assert.ok(sentMessages[0].text.includes('Member VIP yang sudah berlangganan'));

    // Stranger is NOT saved
    assert.strictEqual(mockDb.tables.telegram_subscribers.has('1122334455'), false);
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

await test('telegram relay dispatches using server env.TELEGRAM_BOT_TOKEN when client token is omitted', async () => {
  const { onRequestPost: handleTelegramRelay } = await import('../functions/api/notify/telegram.js');
  let capturedCall = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    capturedCall = { url, opts };
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 888 } }) };
  };

  try {
    const req = new Request('https://xstarzg.com/api/notify/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: '1287273759', text: 'High Score Alert SOL/USDT' })
    });
    const env = { TELEGRAM_BOT_TOKEN: '123456:ABC_OFFICIAL_VIP_TOKEN' };
    const res = await handleTelegramRelay({ request: req, env });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(capturedCall.url, 'https://api.telegram.org/bot123456:ABC_OFFICIAL_VIP_TOKEN/sendMessage');
    const sentBody = JSON.parse(capturedCall.opts.body);
    assert.strictEqual(sentBody.chat_id, '1287273759');
    assert.strictEqual(sentBody.text, 'High Score Alert SOL/USDT');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('app.js and index.html support cloud-bot VIP notifications without local botToken', async () => {
  const fs = await import('fs');
  const appJs = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const indexHtml = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

  // checkTelegramHighScoreSignal does not block on empty botToken
  assert.ok(!appJs.includes('if (!telegramConfig.notifyHighScore || !telegramConfig.botToken || !telegramConfig.chatId) return;'));
  assert.ok(appJs.includes('if (!telegramConfig.notifyHighScore) return;'));

  // sendTelegramAlert relays to /api/notify/telegram when botToken is absent
  assert.ok(appJs.includes('/api/notify/telegram'));

  // index.html has lblTelegramVipJnlText in the journal tab header
  assert.ok(indexHtml.includes('id="lblTelegramVipJnlText"'));
  assert.ok(appJs.includes("txtJnlEl = $id('lblTelegramVipJnlText')"));

  // Signal creation locks call checkTelegramHighScoreSignal
  assert.ok(appJs.includes('saveSignalLock(symbol, tfA, nl);\n                SE.applyLockedSignal(a, nl, { status: \'ACTIVE\', bePlusActive: false });\n                try { checkTelegramHighScoreSignal(a, { sym: symbol, tf: tfA }); } catch (e) {}'));

  // bootCore syncs telegram status on startup
  assert.ok(appJs.includes('try { loadPersistedTelegramConfig(); } catch (e) {}'));
  assert.ok(appJs.includes('function syncTelegramLinkStatus()'));
});

await test('telegram relay auto-resolves chatId from authenticated subscriber record when omitted by client', async () => {
  const { onRequestPost: handleTelegramRelay } = await import('../functions/api/notify/telegram.js');
  let capturedCall = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    capturedCall = { url, opts };
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 999 } }) };
  };

  try {
    const env = {
      TELEGRAM_BOT_TOKEN: '123:ABC_TEST',
      JWT_SECRET: 'secret-xyz',
      DB: {
        prepare: (sql) => ({
          bind: (...args) => ({
            first: async () => ({ chat_id: '1287273759' })
          })
        })
      }
    };
    const token = await signJwt({ email: 'sevenfoldarmy2822@gmail.com', tier: 'OWNER_VIP' }, env.JWT_SECRET);
    const req = new Request('https://xstarzg.com/api/notify/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ text: 'Auto resolved chat alert' })
    });

    const res = await handleTelegramRelay({ request: req, env });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.chatId, '1287273759');
    const sentBody = JSON.parse(capturedCall.opts.body);
    assert.strictEqual(sentBody.chat_id, '1287273759');
    assert.strictEqual(sentBody.text, 'Auto resolved chat alert');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('market-sentinel and app.js implement weekend market closure filtering for forex and stocks', async () => {
  const fs = await import('fs');
  const appJs = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const { isAssetMarketOpen } = await import('../scripts/market-sentinel.mjs');

  // Crypto always open
  assert.strictEqual(isAssetMarketOpen('BTC/USDT'), true);
  assert.strictEqual(isAssetMarketOpen('ETH/USDT'), true);
  assert.strictEqual(isAssetMarketOpen('SOL/USDT'), true);

  // app.js has isAssetMarketOpen and guards
  assert.ok(appJs.includes('function isAssetMarketOpen(symbol)'));
  assert.ok(appJs.includes('if (!isAssetMarketOpen(sym)) return;'));
  assert.ok(appJs.includes('if (nl && isAssetMarketOpen(symbol) && isPriceCompatibleWithSymbol(nl.entry, symbol))'));
});

await test('smart signal alarm dispatches instant Telegram alerts for watched pair', async () => {
  const fs = await import('fs');
  const appJs = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

  // checkSignalAlarm sends telegram message
  assert.ok(appJs.includes('ALARM PANTAUAN KHUSUS BERBUNYI'));
  assert.ok(appJs.includes('ALARM ENTRY TERSENTUH'));
  // toggleSignalAlarm confirms activation to Telegram
  assert.ok(appJs.includes('ALARM PANTAUAN PRIORITAS AKTIF'));
});

await test('telegram-link handles action send_alert and dispatches to telegram with CORS headers', async () => {
  const mockDb = new MockD1();
  // Register subscriber
  await mockDb.prepare('INSERT INTO telegram_subscribers VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind('1287273759', 'sevenfoldarmy2822@gmail.com', 'OWNER_VIP', null, 1, 0, new Date().toISOString())
    .run();

  let sentMessages = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url.includes('api.telegram.org')) {
      const body = JSON.parse(options.body);
      sentMessages.push(body);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1010 } }), { status: 200 });
    }
    return originalFetch(url, options);
  };

  try {
    const env = {
      DB: mockDb,
      TELEGRAM_BOT_TOKEN: '12345678:TEST_BOT_TOKEN',
      JWT_SECRET: 'test_jwt_secret_123'
    };

    const vipToken = await signJwt({
      email: 'sevenfoldarmy2822@gmail.com',
      tier: 'OWNER_VIP'
    }, env.JWT_SECRET);

    const req = new Request('https://xstarzg.com/api/notify/telegram-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vipToken}` },
      body: JSON.stringify({ action: 'send_alert', text: '🔔 Sinyal Baru ETH/USDT M5' })
    });

    const res = await handleLink({ request: req, env });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(String(sentMessages[0].chat_id), '1287273759');
    assert.strictEqual(sentMessages[0].text, '🔔 Sinyal Baru ETH/USDT M5');
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('telegram relay endpoint supports OPTIONS CORS preflight and returns 204', async () => {
  const { onRequestOptions } = await import('../functions/api/notify/telegram.js');
  const res = await onRequestOptions();
  assert.strictEqual(res.status, 204);
  assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('POST'));
  assert.ok(res.headers.get('Access-Control-Allow-Headers').includes('Authorization'));
});

await test('app.js Investor and DEX Micin journal items have clickable cards and valid mode switches', async () => {
  const fs = await import('fs');
  const appJs = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

  // No nonexistent switchMode or syncModeToDom
  assert.ok(!appJs.includes('switchMode('));
  assert.ok(!appJs.includes('syncModeToDom('));

  // Cards have cursor pointer and navigation click listeners
  assert.ok(appJs.includes('inv-jnl-card'));
  assert.ok(appJs.includes('meme-jnl-card'));
  assert.ok(appJs.includes("openInvestorAsset(sym)"));
  assert.ok(appJs.includes("openMemeAsset(sym)"));
  assert.ok(appJs.includes("setMode('investor')"));
  assert.ok(appJs.includes("setMode('meme')"));
});

console.log(`\nTELEGRAM VIP SUITE: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
