import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('public/app.js');
const html = read('public/index.html');
const i18nIndex = read('public/i18n/index.js');
const en = (await import('../public/i18n/locales/en.js')).default;
const sentinel = read('scripts/market-sentinel.mjs');

function flatten(obj, prefix = '', out = {}) {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const full = prefix ? prefix + '.' + key : key;
    if (value && typeof value === 'object') flatten(value, full, out);
    else out[full] = value;
  }
  return out;
}
const enFlat = flatten(en);

test('setiap kunci T() di app.js tersedia di kamus English', () => {
  const keys = new Set();
  const re = /\bT\(\s*['"](ui\.[A-Za-z0-9_]+)['"]\s*,/g;
  let m;
  while ((m = re.exec(app))) keys.add(m[1]);
  const missing = [...keys].filter((k) => !(k in enFlat));
  assert.deepEqual(missing, [], 'kunci tanpa terjemahan English: ' + missing.join(', '));
});

test('setiap kunci data-i18n di index.html tersedia di kamus English', () => {
  const keys = new Set();
  for (const m of html.matchAll(/data-i18n(?:-ph|-title)?="([^"]+)"/g)) keys.add(m[1]);
  const missing = [...keys].filter((k) => !(k in enFlat));
  assert.deepEqual(missing, [], 'kunci HTML tanpa terjemahan English: ' + missing.join(', '));
});

test('t() memakai rantai fallback kamus aktif -> English -> teks kode', () => {
  assert.ok(i18nIndex.includes("import englishDictionary from './locales/en.js'"));
  assert.ok(i18nIndex.includes('readKey(englishDictionary, parts)'));
  assert.ok(i18nIndex.includes('if (currentLang !== FALLBACK_LANGUAGE)'));
});

test('workspace investor hanya menampilkan aset yang bisa dibeli nyata', () => {
  assert.ok(app.includes("return currentCatalog().filter(function (inst) {\n    return inst.assetClass === 'stocks' || inst.assetClass === 'crypto';"));
  assert.ok(app.includes('if (investSet && !investSet[inst.symbol]) continue;'));
  assert.ok(app.includes('function syncInvestorCatalogFilters()'));
  assert.ok(app.includes("var allowed = { ALL: 1, IDX: 1, US_STOCKS: 1, CRYPTO: 1 };"));
});

test('pemilih instrumen menandai sesi pasar yang sedang tutup', () => {
  assert.ok(app.includes("var closedTag = grpClosed ? ' ' + T('ui.eMktClosedSuffix', '⏸ SESI TUTUP') : '';"));
  assert.ok(typeof enFlat['ui.eMktClosedSuffix'] === 'string');
});

test('bot cloud mengirim notifikasi Telegram saat setup batal/kadaluarsa', () => {
  assert.ok(sentinel.includes('SETUP CANCELLED / INVALIDATED'));
  assert.ok(sentinel.includes("status: 'CANCELLED'"));
  assert.ok(sentinel.includes('ORDER EXPIRED / CANCEL'));
  assert.ok(sentinel.includes('ORDER MISSED / CANCEL PENDING'));
});
