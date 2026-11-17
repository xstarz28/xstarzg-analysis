import { VIP_WALLET_BSC, USDT_CONTRACT_BSC, VIP_PRICE_USDT } from '../../lib/auth.js';
// Faktur pembayaran VIP: SATU sumber kebenaran sisi server untuk nominal, wallet
// penerima resmi, dan jaringan. Frontend menghidrasi modal pembayaran dari sini
// sehingga jumlah/alamat tidak lagi hardcoded di markup (fallback markup tetap ada).
export async function onRequestGet(context) {
  const now = new Date();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  const invoice = {
    id: 'XS-' + now.toISOString().slice(0, 10).replace(/-/g, '') + '-' + rnd,
    token: 'USDT',
    network: 'BNB Smart Chain (BEP-20)',
    amount: Number(context.env?.VIP_PRICE_USDT) || VIP_PRICE_USDT,
    wallet: VIP_WALLET_BSC,
    contract: USDT_CONTRACT_BSC,
    createdAt: now.toISOString()
  };
  return Response.json({ ok: true, invoice });
}
export async function onRequestPost(context) { return onRequestGet(context); }
