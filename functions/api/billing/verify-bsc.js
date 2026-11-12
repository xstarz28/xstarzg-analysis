import { authenticateRequest, VIP_WALLET_BSC, USDT_CONTRACT_BSC, VIP_PRICE_USDT } from '../../lib/auth.js';
// Register replay-protection per-isolate: txHash yang sudah dipakai untuk aktivasi tidak
// boleh dipakai ulang. Catatan: ini best-effort tanpa D1/KV — jika env menyediakan
// binding XS_TXLOG (KV), dipakai sebagai sumber kebenaran lintas-isolate.
async function isTxUsed(txHash, env) {
  try {
    if (env && env.XS_TXLOG) { return !!(await env.XS_TXLOG.get('tx:' + txHash.toLowerCase())); }
  } catch (e) {}
  return usedTx.has(txHash.toLowerCase());
}
async function markTxUsed(txHash, env) {
  const k = txHash.toLowerCase();
  usedTx.add(k);
  if (usedTx.size > 10000) usedTx.clear(); // jaga memori isolate
  try { if (env && env.XS_TXLOG) await env.XS_TXLOG.put('tx:' + k, '1', { expirationTtl: 60 * 60 * 24 * 365 }); } catch (e) {}
}
const usedTx = new Set();
export async function onRequestPost(context) {
  try {
    const user = await authenticateRequest(context.request, context.env);
    const { txHash } = await context.request.json();
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash.trim())) {
      return Response.json({ ok: false, error: 'Format TxHash BSC tidak valid.' }, { status: 400 });
    }
    const rpcUrl = context.env?.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';
    const rpcRes = await fetch(rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash.trim()] })
    });
    const rpcData = await rpcRes.json();
    const receipt = rpcData?.result;
    if (!receipt || receipt.status !== '0x1') {
      return Response.json({ ok: false, error: 'Transaksi belum ditemukan di jaringan BSC.' }, { status: 400 });
    }
    const targetWalletHex = VIP_WALLET_BSC.toLowerCase().replace('0x', '').padStart(64, '0');
    const matchedLog = (receipt.logs || []).find(l =>
      (l.address || '').toLowerCase() === USDT_CONTRACT_BSC.toLowerCase() &&
      Array.isArray(l.topics) && (l.topics[2] || '').toLowerCase().endsWith(targetWalletHex)
    );
    if (!matchedLog) return Response.json({ ok: false, error: 'Transfer USDT ke wallet VIP tidak ditemukan.' }, { status: 400 });
    // Cek jumlah pembayaran: value (hex, 18 desimal USDT BSC) harus >= harga VIP.
    // Ini menutup celah "kirim 0.01 USDT lalu klaim VIP $29".
    const valueHex = typeof matchedLog.data === 'string' ? matchedLog.data : '0x0';
    let paidUnits = 0n;
    try { paidUnits = BigInt(valueHex); } catch (e) { return Response.json({ ok: false, error: 'Data log transfer tidak valid.' }, { status: 400 }); }
    const minUnits = BigInt(Math.round((Number(context.env?.VIP_PRICE_USDT) || VIP_PRICE_USDT) * 1e6)) * (10n ** 12n); // *1e18
    if (paidUnits < minUnits) {
      return Response.json({ ok: false, error: 'Jumlah pembayaran USDT kurang dari harga VIP ($' + String(Number(context.env?.VIP_PRICE_USDT) || VIP_PRICE_USDT) + ').' }, { status: 400 });
    }
    // Anti-replay: satu txHash hanya bisa mengaktivasi satu akun.
    if (await isTxUsed(txHash, context.env)) {
      return Response.json({ ok: false, error: 'TxHash ini sudah pernah dipakai untuk aktivasi VIP.' }, { status: 409 });
    }
    await markTxUsed(txHash, context.env);
    return Response.json({ ok: true, tier: 'VIP', daysAdded: 30 });
  } catch (e) {
    return Response.json({ ok: false, error: e.message || 'Gagal verifikasi BSC.' }, { status: 500 });
  }
}