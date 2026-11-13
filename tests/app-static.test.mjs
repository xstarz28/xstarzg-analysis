// Verifikasi statis integrasi app.js + index.html (Node, tanpa dependensi).
// Fokus: cache-bust versi, isolasi kalkulator dari generator sinyal, keberadaan
// wiring lock / scan multi-TF / gerbang, dan kesehatan i18n.
import fs from 'node:fs';

const R = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const html = R('../public/index.html');
const app = R('../public/app.js');
const boot = R('../public/js/engine-boot.js');
const i18nIndex = R('../public/i18n/index.js');

let passed = 0, failed = 0;
const chk = (n, c) => { if (c) { passed++; } else { failed++; console.log('FAIL:', n); } };

// --- Versi cache-bust ---
chk('index.html memakai v=2026.38 (styles)', /styles\.css\?v=2026\.38/.test(html));
chk('index.html memakai v=2026.38 (app.js)', /app\.js\?v=2026\.38/.test(html));
chk('index.html memakai v=2026.38 (engine-boot module)', /<script type="module" src="\/js\/engine-boot\.js\?v=2026\.38">/.test(html));
chk('index.html memakai v=2026.38 (i18n boot module)', /<script type="module" src="\/i18n\/boot\.js\?v=2026\.38">/.test(html));
chk('engine-boot import shared v=2026.38 (2x)', /quant-core\.js\?v=2026\.38/.test(boot) && /signal-engine\.js\?v=2026\.38/.test(boot));
chk('i18n index import locale v=2026.38', /locales\/\$\{currentLang\}\.js\?v=2026\.38/.test(i18nIndex));
chk('tidak ada sisa versi lama 2026.36/2026.37', !/2026\.36|2026\.37/.test(html + boot + i18nIndex));

// --- Isolasi kalkulator (aturan #3.3) ---
const calcInputBindings = (app.match(/\['inpCalcBalance', 'inpCalcRiskPct'\][\s\S]{0,220}/g) || []).join('');
chk('input kalkulator hanya memicu updateRiskSizing', calcInputBindings.includes('updateRiskSizing') && !calcInputBindings.includes('runFullAnalysis'));
{
  const i = app.indexOf('function updateRiskSizing()');
  const body = app.slice(i, app.indexOf('/* ==================== 9.', i));
  chk('updateRiskSizing tidak memanggil engine ulang', !body.includes('computeQuantEngine') && !body.includes('runFullAnalysis(') && !body.includes('runFullAnalysis ='));
}
chk('kalkulator menolak menghitung saat tidak ada sinyal terkunci', app.includes("valCalcLotSize', '--'"));

// --- Wiring lock persisten (aturan #3.2) ---
chk('kunci storage siglock v2 ada', app.includes("'xstarzg_siglock_v2'"));
chk('radar/kurasi memakai scope apply (tidak menerbitkan lock)', app.includes("computeQuantEngine(d.candles, item.sym, item.tf, false, 'apply')"));
chk('lock divalidasi sebelum diterapkan', app.includes('SE.validateSignalLock(') && app.includes('SE.applyLockedSignal('));
chk('lock baru diterbitkan hanya dari sinyal eligible', /a\.signalEligible\)\s*\{\s*var nl = SE\.createSignalLock/.test(app));

// --- Wiring scan multi-TF (aturan #2) ---
chk('9 TF dipindai', app.includes("'M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'"));
chk('scan dijadwalkan setelah analisis', app.includes('scheduleBestTfScan();'));
chk('papan TF terbaik dirender ke narasi', app.includes('state.bestTfBoard'));
chk('badge NO-TRADE tersedia', app.includes('eNoTradeTf'));

// --- Kesehatan i18n: 20 locale seragam ---
const langs = ['id', 'en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'ar', 'ru', 'es', 'pt', 'fr', 'de', 'hi', 'tr', 'vi', 'th', 'ms', 'nl', 'it', 'pl'];
const mods = await Promise.all(langs.map(l => import(`../public/i18n/locales/${l}.js`)));
const ref = Object.keys(mods[0].default.ui).sort().join('|');
let uniform = true, count = Object.keys(mods[0].default.ui).length;
mods.forEach((m, i) => { if (Object.keys(m.default.ui).sort().join('|') !== ref) { uniform = false; console.log('  key mismatch:', langs[i]); } });
chk('20 locale punya keyset ui seragam (386)', uniform && count === 386);

console.log(`APP-STATIC: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
