import { authenticateRequest, VIP_WALLET_BSC, USDT_CONTRACT_BSC } from '../../lib/auth.js';
export async function onRequestPost(context) {
  try {
    const user = await authenticateRequest(context.request, context.env);
    const { txHash } = await context.request.json();
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash.trim())) {
      return Response.json({ ok: false, error: 'Format TxHash BSC tidak valid.' }, { status: 400 });
    }
    const rpcUrl = context.env?.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';
    const rpcRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash.trim()] })
    });
    const rpcData = await rpcRes.json();
    const receipt = rpcData?.result;
    if (!receipt || receipt.status !== '0x1') {
      return Response.json({ ok: false, error: 'Transaksi belum ditemukan atau belum sukses di jaringan BSC.' }, { status: 400 });
    }
    const targetWalletHex = VIP_WALLET_BSC.toLowerCase().replace('0x', '').padStart(64, '0');
    const matchedLog = (receipt.logs || []).find(l =>
      (l.address || '').toLowerCase() === USDT_CONTRACT_BSC.toLowerCase() &&
      Array.isArray(l.topics) &&
      (l.topics[2] || '').toLowerCase().endsWith(targetWalletHex)
    );
    if (!matchedLog) {
      return Response.json({ ok: false, error: 'Transfer USDT ke wallet VIP XSTARZG tidak ditemukan pada TxHash ini.' }, { status: 400 });
    }
    if (context.env?.DB && user?.email) {
      const nowSec = Math.floor(Date.now() / 1000);
      const vipUntil = nowSec + 86400 * 30;
      try {
        await context.env.DB.prepare(`UPDATE users SET tier = 'VIP', vip_until = ?, updated_at = ? WHERE email = ?`)
          .bind(vipUntil, nowSec, user.email).run();
      } catch {}
    }
    return Response.json({ ok: true, tier: 'VIP', daysAdded: 30 });
  } catch (e) {
    return Response.json({ ok: false, error: e.message || 'Gagal verifikasi BSC.' }, { status: 500 });
  }
}
