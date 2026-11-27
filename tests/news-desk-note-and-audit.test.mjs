import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('public/app.js');
const html = read('public/index.html');
const en = (await import('../public/i18n/locales/en.js')).default;
const id = (await import('../public/i18n/locales/id.js')).default;

test('catatan desk harian tampil di atas pilar teknikal & fundamental', () => {
  const desk = html.indexOf('id="deskNoteSection"');
  const tech = html.indexOf('data-i18n="ui.secTech"');
  const macro = html.indexOf('data-i18n="ui.secMacro"');
  assert.ok(desk > -1, 'kartu Morning Desk Note ada di dashboard analisis');
  assert.ok(desk < tech && desk < macro, 'posisi catatan di atas pilar teknikal & fundamental');
  assert.ok(html.includes('id="deskNoteBox"'));
  assert.ok(html.includes('id="newsAccuracyBar"'));
});

test('catatan dirakit dari kalender, bukan angka karangan', () => {
  assert.ok(app.includes('function renderDeskNote()'));
  assert.ok(app.includes('function newsTodayEvents('));
  assert.ok(app.includes('function newsBiasBoard('));
  assert.ok(app.includes('function newsCurrencyBoard('));
  assert.ok(app.includes("timeZone: 'Asia/Jakarta'"), 'stempel waktu WIB');
  assert.ok(app.includes('function deskMeasuredSentiment()'));
  assert.ok(app.includes('no invented index'), 'sentimen terukur, bukan indeks eksternal');
  assert.ok(app.includes('getClientInstitutionalEvents(Date.now())'), 'fallback jadwal kalender situs');
});

test('kelas volatilitas HIGH/MEDIUM/LOW berbeda untuk scalp', () => {
  assert.ok(/HIGH:\s*\{\s*mult:\s*2\.6,\s*guardMin:\s*15\s*\}/.test(app));
  assert.ok(/MEDIUM:\s*\{\s*mult:\s*1\.5,\s*guardMin:\s*10\s*\}/.test(app));
  assert.ok(/LOW:\s*\{\s*mult:\s*0\.8,\s*guardMin:\s*5\s*\}/.test(app));
  assert.ok(app.includes('newsVolRule(ev.impact)'));
});

test('audit prakiraan memakai angka rilis resmi & hasil nyata instrumen', () => {
  assert.ok(app.includes('function newsAccuracySummary('));
  assert.ok(app.includes('function newsRealizedCheck('));
  assert.ok(app.includes('newsRealizedCheck(ev, state.symbol)'));
  assert.ok(app.includes('releasedNoActual: isDone && act == null'));
  assert.ok(app.includes("T('ui.newsReleasedNoActual'"));
  assert.ok(app.includes("T('ui.newsAccuracyHead'"));
  assert.ok(app.includes("T('ui.newsPostHead'") && app.includes("T('ui.newsPreHead'"));
});

test('catatan menjadi konteks fundamental pilar Katalis Terdekat', () => {
  assert.ok(app.includes('function deskCatalystValue('));
  assert.ok(app.includes("deskCatalystValue(state.symbol, fc.upcomingCatalyst)"));
  assert.ok(app.includes("deskCatalystNote(state.symbol, fc.macroDriver)"));
  assert.ok(app.includes('try { renderDeskNote(); } catch (e) {}'));
});

test('kunci i18n catatan desk tersedia dalam English & Indonesia', () => {
  const keys = ['deskTitle', 'deskSub', 'deskAgenda', 'deskConsensus', 'deskVol', 'deskSentiment',
    'deskAudit', 'deskAuditLine', 'deskEngineLine', 'deskRefresh', 'deskOpenCal',
    'newsReleasedNoActual', 'newsAccuracyHead', 'newsVolTag', 'newsRealizedHead',
    'newsPreHead', 'newsPostHead'];
  for (const k of keys) {
    assert.equal(typeof en.ui[k], 'string', 'en.ui.' + k);
    assert.equal(typeof id.ui[k], 'string', 'id.ui.' + k);
  }
  assert.ok(id.ui.deskTitle.includes('Catatan'), 'versi Indonesia tersedia');
  assert.ok(!/Bahasa|Indonesia/.test(en.ui.deskEngineLine), 'English tidak bocor istilah Indonesia');
});
