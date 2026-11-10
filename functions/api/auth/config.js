import { VIP_WALLET_BSC, USDT_CONTRACT_BSC, VIP_PRICE_USDT } from '../../lib/auth.js';
export async function onRequestGet(context) {
  return Response.json({ ok: true, googleClientId: context.env?.GOOGLE_CLIENT_ID || '', vipWalletBsc: VIP_WALLET_BSC, usdtContractBsc: USDT_CONTRACT_BSC, vipPriceUsdt: VIP_PRICE_USDT });
}