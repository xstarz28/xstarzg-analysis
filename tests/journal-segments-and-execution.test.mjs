import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf-8');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf-8');
const sentinelMjs = fs.readFileSync(path.join(root, 'scripts', 'market-sentinel.mjs'), 'utf-8');

test('PENGHAPUSAN KATA MT5 & INSTRUKSI EKSEKUSI ADAPTIF MULTI-ASET', async (t) => {
  await t.test('Tidak ada kata MT5 / MetaTrader dalam template notifikasi Telegram sentinel', () => {
    assert.strictEqual(/MT5/i.test(sentinelMjs), false, 'scripts/market-sentinel.mjs tidak boleh mengandung kata MT5');
    assert.strictEqual(/MetaTrader/i.test(sentinelMjs), false, 'scripts/market-sentinel.mjs tidak boleh mengandung kata MetaTrader');
  });

  await t.test('Pesan eksekusi adaptif mendeteksi crypto, stocks, dan forex/metals', () => {
    assert.ok(sentinelMjs.includes('Binance/Bybit/Tokocrypto'), 'Harus menyebut panduan exchange untuk kripto');
    assert.ok(sentinelMjs.includes('broker saham') || sentinelMjs.includes('sekuritas'), 'Harus menyebut broker sekuritas untuk saham');
    assert.ok(sentinelMjs.includes('aplikasi trading'), 'Harus panduan universal untuk instrumen lainnya');
  });

  await t.test('Tidak ada instruksi MT5 di dalam modal dan peringatan app.js', () => {
    assert.strictEqual(/\bMT5\b/.test(appJs), false, 'public/app.js tidak boleh menyebut MT5');
    assert.ok(appJs.includes('aplikasi trading / exchange') || appJs.includes('broker / exchange'), 'Harus memuat instruksi eksekusi universal di app.js');
  });
});

test('3 SEGMEN TAB JURNAL SINYAL (TRADER • INVESTOR • DEX MICIN)', async (t) => {
  await t.test('HTML memiliki 3 tombol tab segmen dengan badge hitungan terpisah', () => {
    assert.ok(html.includes('id="btnTabJnlTrader"'), 'Harus ada tab Jurnal Trader');
    assert.ok(html.includes('id="btnTabJnlInvestor"'), 'Harus ada tab Jurnal Investor');
    assert.ok(html.includes('id="btnTabJnlMeme"'), 'Harus ada tab Jurnal DEX Micin');
    assert.ok(html.includes('id="badgeCountJnlTrader"'), 'Harus ada badge hitungan Trader');
    assert.ok(html.includes('id="badgeCountJnlInvestor"'), 'Harus ada badge hitungan Investor');
    assert.ok(html.includes('id="badgeCountJnlMeme"'), 'Harus ada badge hitungan DEX Micin');
  });

  await t.test('HTML memiliki sub-bar aksi & statistik untuk Investor dan DEX Micin', () => {
    assert.ok(html.includes('id="investorJournalBar"'), 'Harus ada investorJournalBar');
    assert.ok(html.includes('id="invStatCount"'), 'Harus ada counter aset investor');
    assert.ok(html.includes('id="invStatAvgReturn"'), 'Harus ada rata-rata return investor');
    assert.ok(html.includes('id="invStatWinRate"'), 'Harus ada win rate hijau investor');

    assert.ok(html.includes('id="memeJournalBar"'), 'Harus ada memeJournalBar');
    assert.ok(html.includes('id="memeStatCount"'), 'Harus ada counter koin micin');
    assert.ok(html.includes('id="memeStatBestGain"'), 'Harus ada kelipatan tertinggi');
    assert.ok(html.includes('id="memeStatSafeCount"'), 'Harus ada counter koin 2x safe');
  });

  await t.test('HTML memiliki tombol catat manual pada Workspace Investor dan Meme DEX', () => {
    assert.ok(html.includes('id="btnOpenAddInvestorModal"'), 'Harus ada tombol catat manual di panel Investor');
    assert.ok(html.includes('id="btnOpenAddMemeModal"'), 'Harus ada tombol catat manual di panel DEX Meme');
  });

  await t.test('HTML memiliki modal pencatatan manual untuk Investor dan DEX Micin', () => {
    assert.ok(html.includes('id="addInvestorModal"'), 'Harus ada addInvestorModal');
    assert.ok(html.includes('id="inpAddInvSymbol"'), 'Harus ada input simbol investor');
    assert.ok(html.includes('id="inpAddInvEntry"'), 'Harus ada input harga beli investor');
    assert.ok(html.includes('id="btnSubmitAddInvestor"'), 'Harus ada tombol submit investor');

    assert.ok(html.includes('id="addMemeModal"'), 'Harus ada addMemeModal');
    assert.ok(html.includes('id="inpAddMemeSymbol"'), 'Harus ada input simbol koin micin');
    assert.ok(html.includes('id="inpAddMemeBuyPrice"'), 'Harus ada input harga beli micin');
    assert.ok(html.includes('id="inpAddMemeTargetX"'), 'Harus ada input target kelipatan x');
    assert.ok(html.includes('id="btnSubmitAddMeme"'), 'Harus ada tombol submit koin micin');
  });
});

test('LOGIKA PENYIMPANAN & KALKULASI PORTOFOLIO DI APP.JS', async (t) => {
  await t.test('app.js mengimplementasikan storage schema untuk Investor dan DEX Micin', () => {
    assert.ok(appJs.includes('investorJournalStore'), 'Harus ada fungsi investorJournalStore');
    assert.ok(appJs.includes('saveInvestorJournalStore'), 'Harus ada fungsi saveInvestorJournalStore');
    assert.ok(appJs.includes('memeJournalStore'), 'Harus ada fungsi memeJournalStore');
    assert.ok(appJs.includes('saveMemeJournalStore'), 'Harus ada fungsi saveMemeJournalStore');
    assert.ok(appJs.includes('removeInvestorJournalItem'), 'Harus ada fungsi hapus item investor');
    assert.ok(appJs.includes('removeMemeJournalItem'), 'Harus ada fungsi hapus item meme');
  });

  await t.test('app.js memuat event listener switching 3 tab jurnal', () => {
    assert.ok(appJs.includes("activeJournalTab = 'trader'"), 'Harus dapat switch ke tab trader');
    assert.ok(appJs.includes("activeJournalTab = 'investor'"), 'Harus dapat switch ke tab investor');
    assert.ok(appJs.includes("activeJournalTab = 'meme'"), 'Harus dapat switch ke tab meme');
    assert.ok(appJs.includes("bind('btnTabJnlTrader'"), 'Harus ada handler klik tab trader');
    assert.ok(appJs.includes("bind('btnTabJnlInvestor'"), 'Harus ada handler klik tab investor');
    assert.ok(appJs.includes("bind('btnTabJnlMeme'"), 'Harus ada handler klik tab meme');
  });

  await t.test('app.js memuat aturan Golden Rules 2x (0-Risk) untuk DEX Micin', () => {
    assert.ok(appJs.includes('GOLDEN RULE 2x TERPENUHI'), 'Harus ada panduan golden rule 2x ambil modal');
    assert.ok(appJs.includes('Moonbag'), 'Harus ada konsep moonbag aman tanpa risiko');
  });
});

test('AUDIT VERIFIKASI HASIL PREDIKSI BERITA EKONOMI (ANTI-OMONG KOSONG)', async (t) => {
  await t.test('HTML memiliki tombol filter AUDIT HASIL ASLI pada kalender berita', () => {
    assert.ok(html.includes('data-nf="verified"'), 'Harus ada filter data-nf="verified"');
    assert.ok(html.includes('Audit Verifikasi Hasil Nyata'), 'Harus ada heading audit verifikasi berita');
  });

  await t.test('app.js mengimplementasikan evaluasi prediksi vs rilis aktual & dampak emas', () => {
    assert.ok(appJs.includes('evalNewsPredictionOutcome'), 'Harus ada fungsi evalNewsPredictionOutcome');
    assert.ok(appJs.includes('PREDIKSI TEPAT (TERKONFIRMASI)'), 'Harus ada status prediksi tepat terkonfirmasi');
    assert.ok(appJs.includes('KEJUTAN PASAR (DEVIASI BERLAWANAN)'), 'Harus ada status kejutan pasar deviasi');
    assert.ok(appJs.includes('Dampak Nyata Emas'), 'Harus menampilkan dampak nyata ke emas XAU/USD');
  });

  await t.test('edge calendar menyimpan predDir dan outcomeStatus', () => {
    const edgeCal = fs.readFileSync(path.join(root, 'functions', 'api', 'news', 'calendar.js'), 'utf-8');
    assert.ok(edgeCal.includes('outcomeStatus'), 'calendar.js harus memuat outcomeStatus');
    assert.ok(edgeCal.includes('predDir'), 'calendar.js harus memuat predDir');
  });
});

test('JURNAL INVESTOR & DEX TIDAK LAGI DIISI OLEH ENGINE REKOMENDASI', async (t) => {
  await t.test('fungsi sinkronisasi rekomendasi Investor/DEX hanya mengembalikan daftar kosong', () => {
    const memeSyncAt = appJs.indexOf('function syncRecommendedMemeToJournal() {');

    const investorSyncAt = appJs.indexOf('function syncCuratedInvestorToJournal() {');

    assert.ok(memeSyncAt >= 0 && appJs.slice(memeSyncAt, memeSyncAt + 260).includes('return [];'), 'DEX recommendation sync harus no-op');
    assert.ok(investorSyncAt >= 0 && appJs.slice(investorSyncAt, investorSyncAt + 260).includes('return [];'), 'Investor recommendation sync harus no-op');
  });

  await t.test('jurnal Investor/DEX hanya membaca entri yang disimpan secara manual', () => {
    assert.ok(appJs.includes('function investorJournalStore() {') && appJs.includes('localStorage.getItem(journalStorageKey(INVESTOR_JOURNAL_KEY))'), 'Investor journal membaca storage lokal per akun');
    assert.ok(appJs.includes('function memeJournalStore() {') && appJs.includes('localStorage.getItem(journalStorageKey(MEME_JOURNAL_KEY))'), 'DEX journal membaca storage lokal per akun');
  });

  await t.test('checkSignalAlarm memblokir feed estimasi, seed lokal, dan pasar tutup', () => {
    assert.ok(appJs.includes('isAssetMarketOpen(sym)'), 'Harus memeriksa isAssetMarketOpen');
    assert.ok(appJs.includes('isPriceCompatibleWithSymbol(lastP, sym)'), 'Harus memeriksa isPriceCompatibleWithSymbol');
    assert.ok(appJs.includes("analysis.feedSource === 'LOCAL_SEED'"), 'Harus memblokir LOCAL_SEED');
  });

  await t.test('checkTelegramHighScoreSignal tidak mencemari livePrice dengan state.candles milik pair lain', () => {
    assert.ok(appJs.includes('Dapatkan livePrice KHUSUS untuk instrumen ini'), 'Harus mencari livePrice per-simbol');
  });
});

test('RESET RIWAYAT JURNAL TERBATAS PADA AKUN AKTIF', async (t) => {
  await t.test('HTML memiliki tombol btnClearAllJournalHistory di toolbar jurnal', () => {
    assert.ok(html.includes('id="btnClearAllJournalHistory"'), 'Harus ada tombol id="btnClearAllJournalHistory"');
  });

  await t.test('app.js mengikat reset lokal dan cloud per akun tanpa menghapus key legacy global', () => {
    assert.ok(appJs.includes("bind('btnClearAllJournalHistory'"), 'Harus ada binding btnClearAllJournalHistory');
    const handlerStart = appJs.indexOf("bind('btnClearAllJournalHistory'");
    const handlerEnd = appJs.indexOf("bind('btnToggleSlPlusNotify'", handlerStart);
    const handler = appJs.slice(handlerStart, handlerEnd);
    assert.equal((appJs.match(/bind\('btnClearAllJournalHistory'/g) || []).length, 1, 'Tombol reset hanya punya satu handler');
    assert.equal((handler.match(/confirm\(/g) || []).length, 1, 'Konfirmasi reset hanya dipanggil satu kali');
    assert.ok(appJs.includes("JSON.stringify({ action: 'clear_user_journal' })"), 'Reset cloud harus meminta penghapusan akun aktif');
    assert.ok(appJs.includes('journalStorageKey(key)'), 'Storage jurnal harus memiliki namespace akun');
    assert.ok(appJs.includes("return key === base + accountSuffix;"), 'Reset lokal hanya boleh menghapus key akun yang sedang login');
    assert.ok(appJs.includes('journalTombstoneKey()'), 'Reset harus menyimpan tombstone lokal per akun');
    assert.ok(appJs.includes("'Authorization': 'Bearer ' + token"), 'Reset harus mengirim sesi autentikasi akun');
    assert.ok(!appJs.includes("JSON.stringify({ action: 'clear_all' })"), 'Endpoint global clear_all tidak boleh digunakan');
  });

  await t.test('reset satu akun tidak menghapus journal key akun lain atau key legacy tak bertuan', () => {
    const start = appJs.indexOf('function clearLocalJournalKeys()');
    const end = appJs.indexOf('\nfunction signalLockStore()', start);
    const clearSource = appJs.slice(start, end);
    const storage = new Map([
      ['xstarzg_siglock_v3:owner%40example.test', '{}'],
      ['xstarzg_siglock_v3:other%40example.test', '{}'],
      ['xstarzg_meme_journal_v1:owner%40example.test', '[]'],
      ['xstarzg_meme_journal_v1:other%40example.test', '[]'],
      ['xstarzg_siglock_v2', '{}']
    ]);
    const localStorage = {
      get length() { return storage.size; },
      key(index) { return Array.from(storage.keys())[index] || null; },
      removeItem(key) { storage.delete(key); }
    };
    const clear = new Function(
      'localStorage',
      'state',
      'LEGACY_JOURNAL_KEYS',
      `${clearSource}; return clearLocalJournalKeys();`
    );
    clear(localStorage, { user: { email: 'owner@example.test' } }, [
      'xstarzg_siglock_v3', 'xstarzg_meme_journal_v1'
    ]);
    assert.deepEqual(Array.from(storage.keys()), [
      'xstarzg_siglock_v3:other%40example.test',
      'xstarzg_meme_journal_v1:other%40example.test',
      'xstarzg_siglock_v2'
    ]);
  });
});

