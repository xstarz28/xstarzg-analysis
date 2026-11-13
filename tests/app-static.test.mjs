// Verifikasi statis integrasi app.js + index.html (Node, tanpa dependensi).
// Fokus: cache-bust versi, isolasi kalkulator dari generator sinyal, keberadaan
// wiring lock / scan multi-TF / gerbang, dan kesehatan i18n.
import fs from 'node:fs';

const R = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const html = R('../public/index.html');
const app = R('../public/app.js');
const boot = R('../public/js/engine-boot.js');
const i18nIndex = R('../public/i18n/index.js');
const eng = R('../public/js/shared/signal-engine.js');

let passed = 0, failed = 0;
const chk = (n, c) => { if (c) { passed++; } else { failed++; console.log('FAIL:', n); } };

// --- Versi cache-bust ---
chk('index.html memakai v=2026.40 (styles)', /styles\.css\?v=2026\.40/.test(html));
chk('index.html memakai v=2026.40 (app.js)', /app\.js\?v=2026\.40/.test(html));
chk('index.html memakai v=2026.40 (engine-boot module)', /<script type="module" src="\/js\/engine-boot\.js\?v=2026\.40">/.test(html));
chk('index.html memakai v=2026.40 (i18n boot module)', /<script type="module" src="\/i18n\/boot\.js\?v=2026\.40">/.test(html));
chk('engine-boot import shared v=2026.40 (2x)', /quant-core\.js\?v=2026\.40/.test(boot) && /signal-engine\.js\?v=2026\.40/.test(boot));
chk('i18n index import locale v=2026.40', /locales\/\$\{currentLang\}\.js\?v=2026\.40/.test(i18nIndex));
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
// Wiring i18n baris Institutional Gate (lulus/ditolak) + map 9 label veto
chk('regex gate LULUS/DITOLAK di localizeEngineString', app.includes('Institutional Gate\\] LULUS') && app.includes('Institutional Gate\\] DITOLAK'));
chk('9 label veto dipetakan di ENGINE_TEXT_MAP', ['eVetoOverext','eVetoWall','eVetoExh','eVetoDiv','eVetoHtf','eVetoScore','eVetoWr','eVetoSeq','eVetoChop'].every(k => app.includes("'" + k + "'")));
chk('kunci narasi gate + tier dipakai', ['eGateLockOk','eGateForbidden','eGateBest','eGateBestHint','eGateScanning','eEliteSetup','eProSetup','signalTier'].every(k => app.includes(k)));

// --- Kesehatan i18n: 20 locale seragam ---
const langs = ['id', 'en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'ar', 'ru', 'es', 'pt', 'fr', 'de', 'hi', 'tr', 'vi', 'th', 'ms', 'nl', 'it', 'pl'];
const mods = await Promise.all(langs.map(l => import(`../public/i18n/locales/${l}.js`)));
const ref = Object.keys(mods[0].default.ui).sort().join('|');
let uniform = true, count = Object.keys(mods[0].default.ui).length;
mods.forEach((m, i) => { if (Object.keys(m.default.ui).sort().join('|') !== ref) { uniform = false; console.log('  key mismatch:', langs[i]); } });
chk('20 locale punya keyset ui seragam (406)', uniform && count === 406);
chk('radar memindai seluruh katalog (rotatingSlice + radarScanPool)', app.includes('rotatingSlice(catalogSortedStable()') && app.includes('radarScanPool'));
chk('kurasi investor dari semesta investasi dinamis', app.includes('investableUniverse()') && !app.includes('var INVESTOR_PICKS = ['));
chk('mode investor menyaring TF trader (D1/W1/MN/1Y)', app.includes("var INVESTOR_TFS = ['D1', 'W1', 'MN', '1Y']") && app.includes('syncTfBarForMode()'));
chk('engine expose tier & skor analis', eng.includes('PRO_MIN_SCORE') && eng.includes('signalTier') && eng.includes('analystScore') && eng.includes('detectLiquidityPools'));

console.log(`APP-STATIC: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
