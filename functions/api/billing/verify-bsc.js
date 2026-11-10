import { getAuthenticatedUser, getOwnerWalletAddress } from '../../lib/auth.js';
const BSC_RPC_ENDPOINTS = [
  'https://bsc-dataseed.binance.org/',
  'https://bsc-dataseed1.defibit.io/',
  'https://bsc-dataseed1.ninicoin.io/',
  'https://bsc.publicnode.com'
];
const OFFICIAL_BSC_USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955'.toLowerCase();
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const MIN_CONFIRMATIONS = 12;
async function callBscRpc(method, params) {
  for (const url of BSC_RPC_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.result !== undefined) return data.result;
    } catch (_) {}
  }
  throw new Error('Tidak dapat menghubungi node RPC BNB Smart Chain.');
}
function padAddressTopic(addr) {
  return '0x000000000000000000000000' + addr.toLowerCase().replace(/^0x/, '');
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
    return new Response(JSON.stringify({ ok: false, error: 'Autentikasi diperlukan.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  let body = {};
  try {
    body = await request.json();
  } catch (_) {}
  const invoiceId = String(body.invoiceId || body.invoice_id || '').trim();
  const txHash = String(body.txHash || body.tx_hash || '').trim().toLowerCase();
  if (!invoiceId) {
    return new Response(JSON.stringify({ ok: false, error: 'invoiceId wajib disertakan.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  const invoice = await env.DB.prepare(
    'SELECT * FROM invoices WHERE id = ? AND user_id = ? LIMIT 1'
  )
    .bind(invoiceId, user.id)
    .first();
  if (!invoice) {
    return new Response(JSON.stringify({ ok: false, error: 'Invoice tidak ditemukan.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  if (invoice.status === 'confirmed') {
    return new Response(
      JSON.stringify({ ok: true, verified: true, message: 'Invoice sudah terkonfirmasi sebelumnya.' }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
    return new Response(
      JSON.stringify({ ok: false, verified: false, error: 'Format TX Hash BSC tidak valid (harus 0x diikuti 64 karakter hex).' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
  const duplicateTx = await env.DB.prepare('SELECT id FROM invoices WHERE tx_hash = ? LIMIT 1')
    .bind(txHash)
    .first();
  if (duplicateTx && duplicateTx.id !== invoice.id) {
    return new Response(
      JSON.stringify({ ok: false, verified: false, error: 'TX Hash ini sudah pernah digunakan pada invoice lain.' }),
      { status: 409, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
  try {
    const [receipt, latestBlockHex] = await Promise.all([
      callBscRpc('eth_getTransactionReceipt', [txHash]),
      callBscRpc('eth_blockNumber', [])
    ]);
    if (!receipt || !receipt.blockNumber) {
      return new Response(
        JSON.stringify({ ok: false, verified: false, error: 'Transaksi belum ditemukan atau masih pending di mempool BSC.' }),
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
    if (receipt.status !== '0x1') {
      return new Response(
        JSON.stringify({ ok: false, verified: false, error: 'Transaksi gagal (reverted) di jaringan BSC.' }),
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
    const txBlock = parseInt(receipt.blockNumber, 16);
    const latestBlock = parseInt(latestBlockHex, 16);
    const confirmations = Math.max(0, latestBlock - txBlock + 1);
    if (confirmations < MIN_CONFIRMATIONS) {
      return new Response(
        JSON.stringify({
          ok: false,
          verified: false,
          error: `Menunggu konfirmasi blok: saat ini ${confirmations}/${MIN_CONFIRMATIONS} konfirmasi.`
        }),
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
    const expectedRecipientTopic = padAddressTopic(invoice.recipient_address || getOwnerWalletAddress(env));
    const expectedWei = BigInt(invoice.expected_wei_str);
    const matchingLog = (receipt.logs || []).find((log) => {
      if (!log || String(log.address || '').toLowerCase() !== OFFICIAL_BSC_USDT_CONTRACT) return false;
      const topics = log.topics || [];
      if (String(topics[0] || '').toLowerCase() !== TRANSFER_EVENT_TOPIC) return false;
      if (String(topics[2] || '').toLowerCase() !== expectedRecipientTopic) return false;
      try {
        const transferredWei = BigInt(log.data || '0x0');
        return transferredWei >= expectedWei;
      } catch (_) {
        return false;
      }
    });
    if (!matchingLog) {
      return new Response(
        JSON.stringify({
          ok: false,
          verified: false,
          error: 'Log Transfer USDT BEP-20 ke wallet Owner dengan nominal yang sesuai tidak ditemukan pada transaksi ini.'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const durationSec = (invoice.plan === 'yearly_vip' ? 365 : 30) * 86400;
    const baseStart = Math.max(nowSec, Number(user.vip_until || 0));
    const newVipUntil = baseStart + durationSec;
    await env.DB.prepare(
      `UPDATE invoices SET status = 'confirmed', tx_hash = ?, confirmed_at = ? WHERE id = ?`
    )
      .bind(txHash, nowSec, invoice.id)
      .run();
    await env.DB.prepare(
      `UPDATE users SET role = 'vip', vip_until = ?, updated_at = ? WHERE id = ?`
    )
      .bind(newVipUntil, nowSec, user.id)
      .run();
    return new Response(
      JSON.stringify({
        ok: true,
        verified: true,
        confirmations,
        vipUntil: newVipUntil,
        message: `Pembayaran USDT BEP-20 terverifikasi (${confirmations} konfirmasi blok). Status VIP Anda telah aktif!`
      }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, verified: false, error: err.message || 'Gagal memverifikasi transaksi BSC.' }),
      { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
}