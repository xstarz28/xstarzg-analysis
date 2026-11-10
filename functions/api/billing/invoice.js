import { getAuthenticatedUser, getOwnerWalletAddress } from '../../lib/auth.js';
export const OFFICIAL_BSC_USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';
export const VIP_PLANS = {
  monthly_vip: { id: 'monthly_vip', name: 'VIP Monthly (30 Days)', baseUsdt: 19, durationDays: 30 },
  yearly_vip: { id: 'yearly_vip', name: 'VIP Yearly (365 Days)', baseUsdt: 149, durationDays: 365 }
};
function usdtDisplayToWeiString(displayStr) {
  const [wholePart, fracPart = ''] = String(displayStr).split('.');
  const paddedFrac = (fracPart + '0'.repeat(18)).slice(0, 18);
  const weiBig = BigInt(wholePart) * (10n ** 18n) + BigInt(paddedFrac);
  return weiBig.toString();
}
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env?.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'Database D1 belum terhubung.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  const user = await getAuthenticatedUser(context);
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Silakan Sign In terlebih dahulu untuk membuat invoice VIP.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  let body = {};
  try {
    body = await request.json();
  } catch (_) {}
  const planKey = body.plan === 'yearly_vip' ? 'yearly_vip' : 'monthly_vip';
  const plan = VIP_PLANS[planKey];
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = nowSec + 3600 * 24;
  const recipientAddress = getOwnerWalletAddress(env);
  const randomMicro = Math.floor(1001 + Math.random() * 8898);
  const amountUsdtDisplay = `${plan.baseUsdt}.${String(randomMicro).padStart(4, '0')}`;
  const expectedWeiStr = usdtDisplayToWeiString(amountUsdtDisplay);
  const invoiceId = `inv_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  await env.DB.prepare(
    `INSERT INTO invoices (id, user_id, plan, amount_usdt_display, expected_wei_str, recipient_address, status, tx_hash, created_at, expires_at, confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, NULL)`
  )
    .bind(invoiceId, user.id, plan.id, amountUsdtDisplay, expectedWeiStr, recipientAddress, nowSec, expiresAt)
    .run();
  return new Response(
    JSON.stringify({
      ok: true,
      invoice: {
        id: invoiceId,
        plan: plan.id,
        planName: plan.name,
        durationDays: plan.durationDays,
        amountUsdtDisplay,
        expectedWeiStr,
        recipientAddress,
        usdtContractAddress: OFFICIAL_BSC_USDT_CONTRACT,
        network: 'BNB Smart Chain (BEP-20)',
        chainId: 56,
        minConfirmations: 12,
        status: 'pending',
        createdAt: nowSec,
        expiresAt
      }
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    }
  );
}