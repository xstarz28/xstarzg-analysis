// Audit i18n: keyset seragam, placeholder utuh, dan tidak ada kata yang hanya
// ada di bahasa Indonesia yang bocor ke locale lain (mis. ms/id tercampur).
// Jalankan: node scripts/check-i18n-coverage.mjs
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'public/i18n/locales');
const langs = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, '')).sort();

const flat = (obj, prefix = '') => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') Object.assign(out, flat(v, key));
    else out[key] = String(v);
  }
  return out;
};

const dicts = {};
for (const l of langs) dicts[l] = flat((await import(path.join(dir, `${l}.js`))).default);

const en = dicts.en;
const enKeys = Object.keys(en).sort();
const tokens = s => (s.match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');

// Kata yang hanya dipakai bahasa Indonesia (bukan Melayu/Inggris/locale lain).
// Catatan: kata seperti "sinyal" (Turki) atau "terisi" (Melayu) sengaja tidak
// dipakai sebagai penanda karena juga sah di locale lain.
const ID_ONLY = /\b(bisa|posisi|ukuran|perangkat|karena|sembarang|telanjur|kedaluwarsa|likuidasi|rahasia|akun|uang|dimuat|diperbarui)\b/i;

const problems = [];
for (const l of langs) {
  const d = dicts[l];
  const keys = Object.keys(d).sort();
  if (keys.length !== enKeys.length || keys.some((k, i) => k !== enKeys[i])) {
    const missing = enKeys.filter(k => !(k in d));
    const extra = keys.filter(k => !(k in en));
    problems.push(`${l}: keyset tidak seragam (total ${keys.length}, kurang ${missing.length}, lebih ${extra.length})`);
  }
  if (l === 'id') continue;
  for (const k of keys) {
    if (!(k in en)) continue;
    if (tokens(d[k]) !== tokens(en[k])) {
      problems.push(`${l}: placeholder beda pada ${k}`);
      continue;
    }
    const m = d[k].match(ID_ONLY);
    if (m) problems.push(`${l}: kata Indonesia "${m[0]}" pada ${k} — "${d[k].slice(0, 100)}"`);
  }
}

const uiCount = Object.keys(en).filter(k => k.startsWith('ui.')).length;
console.log(`locale: ${langs.length} (${langs.join(', ')})`);
console.log(`kunci total: ${enKeys.length} | kunci ui: ${uiCount}`);
console.log(problems.length
  ? `MASALAH (${problems.length}):\n${problems.slice(0, 40).join('\n')}`
  : 'OK: keyset seragam, placeholder utuh, tidak ada kata Indonesia di locale non-id.');
