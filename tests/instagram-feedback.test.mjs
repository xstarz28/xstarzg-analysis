// Test verifikasi fitur Instagram Follow, DM Chat, dan Masukan/Kritik Pengguna
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

const IG_URL = 'https://www.instagram.com/xstarzganalysis?avpt=ZWF1dThxYzQwNmNj';
const IG_USER = '@xstarzganalysis';

test('FITUR INSTAGRAM: Link & Akun Resmi Terintegrasi Lengkap di HTML', async (t) => {
  await t.test('index.html memuat tautan Instagram resmi dengan avpt query param', () => {
    assert.ok(html.includes(IG_URL), 'HTML harus memuat URL Instagram resmi');
  });

  await t.test('index.html memuat label username @xstarzganalysis', () => {
    assert.ok(html.includes(IG_USER), 'HTML harus memuat username @xstarzganalysis');
  });

  await t.test('Navbar Halaman Depan memuat tombol Instagram', () => {
    assert.ok(html.includes('class="btn-instagram-social"'), 'Navbar harus memiliki tombol sosial Instagram');
    assert.ok(html.includes(`href="${IG_URL}"`), 'Tombol navbar harus mengarah langsung ke Instagram');
  });

  await t.test('Halaman Depan memuat banner komunitas & saluran masukan resmi Instagram', () => {
    assert.ok(html.includes('instagram-community-banner'), 'Harus ada banner komunitas Instagram di landing page');
    assert.ok(html.includes('Kunjungi Instagram @xstarzganalysis'), 'Banner harus memiliki tombol CTA');
  });

  await t.test('Login Gate memuat tautan DM Instagram untuk masukan & bantuan', () => {
    assert.ok(html.includes('Hubungi DM kami:'), 'Login gate harus menyediakan opsi hubungi via DM');
    assert.ok(html.includes(IG_USER), 'Login gate harus menampilkan @xstarzganalysis');
  });

  await t.test('Topbar Workspace memuat tombol langsung Instagram @xstarzganalysis', () => {
    assert.ok(html.includes('id="btnTopInstagram"'), 'Topbar harus memuat tombol btnTopInstagram');
    assert.ok(html.includes('btnOpenInstagramModal'), 'Control bar harus memuat tombol buka modal masukan/kritik');
  });

  await t.test('Jurnal Sinyal dan Menu Profil memiliki tombol Instagram', () => {
    assert.ok(html.includes('id="btnOpenInstagramModalJnl"'), 'Jurnal harus memiliki tombol modal Instagram');
    assert.ok(html.includes('id="btnOpenInstagramFromMenu"'), 'Menu profil harus memiliki tombol Instagram');
  });

  await t.test('Modal Instagram Feedback (#instagramFeedbackModal) terpasang lengkap', () => {
    assert.ok(html.includes('id="instagramFeedbackModal"'), 'Harus ada modal #instagramFeedbackModal');
    assert.ok(html.includes('id="btnCopyIgLink"'), 'Modal harus memiliki tombol salin link');
    assert.ok(html.includes('id="btnDirectVisitInstagram"'), 'Modal harus memiliki tombol kunjungi Instagram');
    assert.ok(html.includes('id="btnCloseInstagramModal"'), 'Modal harus memiliki tombol tutup');
  });

  await t.test('Footer halaman memuat social-footer-bar dengan tautan Instagram @xstarzganalysis', () => {
    assert.ok(html.includes('social-footer-bar'), 'Harus ada social footer bar di atas disclaimer risiko');
    assert.ok(html.includes(IG_USER), 'Footer harus menampilkan username Instagram @xstarzganalysis');
  });
});

test('FITUR INSTAGRAM: Logika Interaktivitas & Clipboard di app.js', async (t) => {
  await t.test('app.js memuat wiring modal Instagram dan tombol pemicunya', () => {
    assert.ok(app.includes('instagramFeedbackModal'), 'app.js harus mereferensikan instagramFeedbackModal');
    assert.ok(app.includes('openInstagramModal'), 'app.js harus memiliki fungsi openInstagramModal');
    assert.ok(app.includes('closeInstagramModal'), 'app.js harus memiliki fungsi closeInstagramModal');
    assert.ok(app.includes('btnOpenInstagramModal'), 'app.js harus mengikat btnOpenInstagramModal');
    assert.ok(app.includes('btnOpenInstagramModalJnl'), 'app.js harus mengikat btnOpenInstagramModalJnl');
    assert.ok(app.includes('btnOpenInstagramFromMenu'), 'app.js harus mengikat btnOpenInstagramFromMenu');
  });

  await t.test('app.js mengimplementasikan penyalinan link Instagram ke clipboard', () => {
    assert.ok(app.includes('btnCopyIgLink'), 'app.js harus mengikat tombol btnCopyIgLink');
    assert.ok(app.includes('copyIgSuccessToast'), 'app.js harus menampilkan notifikasi sukses salin link');
    assert.ok(app.includes(IG_URL), 'app.js harus memuat URL Instagram resmi');
  });
});

test('FITUR INSTAGRAM: Styling CSS .btn-instagram-social', async (t) => {
  await t.test('styles.css mendefinisikan kelas .btn-instagram-social dengan gradient & hover', () => {
    assert.ok(css.includes('.btn-instagram-social'), 'styles.css harus memuat .btn-instagram-social');
    assert.ok(css.includes('.btn-instagram-social:hover'), 'styles.css harus memuat hover state');
  });
});
