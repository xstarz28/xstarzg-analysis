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

  await t.test('HTML memiliki tombol Quick-Add pada Workspace Investor dan Meme DEX', () => {
    assert.ok(html.includes('id="btnQuickAddInvestorJnl"'), 'Harus ada tombol catat cepat di panel Investor');
    assert.ok(html.includes('id="btnQuickAddMemeJnl"'), 'Harus ada tombol catat cepat di panel DEX Meme');
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
