import { authenticateRequest, signJwt, VIP_WALLET_BSC, USDT_CONTRACT_BSC, VIP_PRICE_USDT } from '../../lib/auth.js';
// Register replay-protection per-isolate: txHash yang sudah dipakai untuk aktivasi tidak
// boleh dipakai ulang. Catatan: ini best-effort tanpa D1/KV — jika env menyediakan
// binding XS_TXLOG (KV) atau DB (D1), dipakai sebagai sumber kebenaran lintas-isolate.
async function isTxUsed(txHash, env) {
  const k = txHash.toLowerCase();
  try {
    if (env && env.XS_TXLOG && await env.XS_TXLOG.get('tx:' + k)) return true;
  } catch (e) {}
  try {
    if (env && env.DB) {
      const row = await env.DB.prepare('SELECT tx_hash FROM vip_tx WHERE tx_hash = ?1').bind(k).first();
      if (row) return true;
    }
  } catch (e) {}
  return usedTx.has(k);
}
async function markTxUsed(txHash, env, email) {
  const k = txHash.toLowerCase();
  usedTx.add(k);
  if (usedTx.size > 10000) usedTx.clear(); // jaga memori isolate
  try { if (env && env.XS_TXLOG) await env.XS_TXLOG.put('tx:' + k, '1', { expirationTtl: 60 * 60 * 24 * 365 }); } catch (e) {}
  try {
    if (env && env.DB) {
      await env.DB.prepare('INSERT INTO vip_tx (tx_hash, email, created_at) VALUES (?1, ?2, ?3)')
        .bind(k, email || '', new Date().toISOString()).run();
    }
  } catch (e) {}
}
async function d1VipUntil(env, email) {
  try {
    if (!env || !env.DB) return 0;
    const row = await env.DB.prepare('SELECT vip_until FROM vip_entitlements WHERE email = ?1').bind(email).first();
    return row && row.vip_until ? Number(row.vip_until) : 0;
  } catch (e) { return 0; }
}
// true = tersimpan permanen, false = D1 gagal menulis, null = tidak ada binding DB.
// Lisensi hanya boleh dilaporkan sukses bila benar-benar tersimpan, agar pembeli
// tidak kehilangan akses saat isolate berikutnya membaca D1 kosong.
async function d1SetVip(env, email, until) {
  if (!env || !env.DB) return null;
  try {
    await env.DB.prepare('INSERT INTO vip_entitlements (email, vip_until, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(email) DO UPDATE SET vip_until = excluded.vip_until, updated_at = excluded.updated_at')
      .bind(email, until, new Date().toISOString()).run();
    return true;
  } catch (e) { return false; }
}
const usedTx = new Set();
export async function onRequestPost(context) {
  try {
    // WAJIB login: pembayaran diikat ke identitas akun. Tanpa sesi JWT valid,
    // tidak ada VIP yang bisa diberikan (sebelumnya pengecekan ini dekoratif).
    const user = await authenticateRequest(context.request, context.env);
    if (!user || !user.email) {
      return Response.json({ ok: false, error: 'Sesi tidak valid. Silakan login ulang lalu verifikasi lagi.' }, { status: 401 });
    }
    const email = String(user.email).trim().toLowerCase();
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
      return Response.json({ ok: false, error: 'Transaksi belum ditemukan di jaringan BSC (atau gagal/revert).' }, { status: 400 });
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
    // Perpanjangan MENUMPUK: basis = max(sekarang, sisa VIP di D1, sisa VIP di token) +30 hari.
    const now = Date.now();
    const dbUntil = await d1VipUntil(context.env, email);
    const jwtUntil = Number(user.vipUntil) || 0;
    const vipUntil = Math.max(now, dbUntil, jwtUntil) + 30 * 86400000;
    const persisted = await d1SetVip(context.env, email, vipUntil);
    if (persisted === false) {
      // Jangan tandai txHash terpakai: pembeli boleh mencoba lagi txhash yang sama.
      return Response.json({ ok: false, error: 'Pembayaran terverifikasi tetapi penyimpanan lisensi gagal. Coba verifikasi ulang beberapa saat lagi.' }, { status: 503 });
    }
    await markTxUsed(txHash, context.env, email);
    // AUTO-APPROVE: entitlement ditandatangani server menjadi JWT baru — klien tidak
    // lagi menentukan tiernya sendiri di localStorage.
    const payload = { email, name: user.name || email.split('@')[0], tier: 'VIP', vipUntil };
    const token = await signJwt(payload, context.env?.JWT_SECRET || 'xstarzg-2026-quant-secret');
    return Response.json({ ok: true, tier: 'VIP', vipUntil, daysAdded: 30, token });
  } catch (e) {
    return Response.json({ ok: false, error: e.message || 'Gagal verifikasi BSC.' }, { status: 500 });
  }
}
