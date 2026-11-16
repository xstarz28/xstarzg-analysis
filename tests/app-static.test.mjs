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
const edgeAnalyze = R('../functions/api/market/analyze.js');
const edgeNews = R('../functions/api/news/calendar.js');
const edgeMacro = R('../functions/api/macro/regime.js');
const calcMod = R('../public/js/calculator.js');
const engineBoot = R('../public/js/engine-boot.js');

let passed = 0, failed = 0;
const chk = (n, c) => { if (c) { passed++; } else { failed++; console.log('FAIL:', n); } };

// --- Versi cache-bust ---
chk('index.html memakai v=2026.46 (styles)', /styles\.css\?v=2026\.59/.test(html));
chk('index.html memakai v=2026.46 (app.js)', /app\.js\?v=2026\.59/.test(html));
chk('index.html memakai v=2026.46 (engine-boot module)', /<script type="module" src="\/js\/engine-boot\.js\?v=2026\.59">/.test(html));
chk('index.html memakai v=2026.46 (i18n boot module)', /<script type="module" src="\/i18n\/boot\.js\?v=2026\.59">/.test(html));
chk('engine-boot import shared v=2026.46 (2x)', /quant-core\.js\?v=2026\.59/.test(boot) && /signal-engine\.js\?v=2026\.59/.test(boot));
chk('i18n index import locale v=2026.46', /locales\/\$\{currentLang\}\.js\?v=2026\.59/.test(i18nIndex));
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
chk('radar/kurasi memakai scope apply + provenance feed (komitmen terlacak sejak tampil)', app.includes("computeQuantEngine(d.candles, item.sym, item.tf, false, 'apply', d.source)"));
chk('lock divalidasi sebelum diterapkan', app.includes('SE.validateSignalLock(') && app.includes('SE.applyLockedSignal('));
chk('lock baru diterbitkan hanya dari sinyal eligible + 2 penjaga', /signalCooldownActive\(symbol, tfA\) && num\(a\.confluenceScore, 0\) >= adaptiveMinScore\(tfA\)\) \{\s*var nl = SE\.createSignalLock/.test(app));

// --- Wiring scan multi-TF (aturan #2) ---
chk('9 TF dipindai', app.includes("'M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'"));
chk('scan dijadwalkan setelah analisis', app.includes('scheduleBestTfScan();'));
chk('papan TF terbaik dirender ke narasi', app.includes('state.bestTfBoard'));
chk('badge NO-TRADE tersedia', app.includes('eNoTradeTf'));
// Wiring i18n baris Institutional Gate (lulus/ditolak) + map 9 label veto
chk('regex gate LULUS/DITOLAK di localizeEngineString', app.includes('Institutional Gate\\] LULUS') && app.includes('Institutional Gate\\] DITOLAK'));
chk('9 label veto dipetakan di ENGINE_TEXT_MAP', ['eVetoOverext','eVetoWall','eVetoExh','eVetoDiv','eVetoHtf','eVetoScore','eVetoWr','eVetoSeq','eVetoChop'].every(k => app.includes("'" + k + "'")));
chk('kunci narasi gate + tier dipakai', ['eGateLockOk','eGateForbidden','eGateBest','eGateBestHint','eGateScanning','eEliteSetup','eProSetup','eGatePassPro','eVetoSpotOnly','signalTier'].every(k => app.includes(k)));

// --- Kesehatan i18n: 20 locale seragam ---
const langs = ['id', 'en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'ar', 'ru', 'es', 'pt', 'fr', 'de', 'hi', 'tr', 'vi', 'th', 'ms', 'nl', 'it', 'pl'];
const mods = await Promise.all(langs.map(l => import(`../public/i18n/locales/${l}.js`)));
const ref = Object.keys(mods[0].default.ui).sort().join('|');
let uniform = true, count = Object.keys(mods[0].default.ui).length;
mods.forEach((m, i) => { if (Object.keys(m.default.ui).sort().join('|') !== ref) { uniform = false; console.log('  key mismatch:', langs[i]); } });
chk('20 locale punya keyset ui seragam (486)', uniform && count === 486);
chk('radar memindai seluruh katalog (rotatingSlice + radarScanPool)', app.includes('rotatingSlice(catalogSortedStable()') && app.includes('radarScanPool'));
chk('kurasi investor dari semesta investasi dinamis', app.includes('investableUniverse()') && !app.includes('var INVESTOR_PICKS = ['));
chk('mode investor menyaring TF trader (D1/W1/MN/1Y)', app.includes("var INVESTOR_TFS = ['D1', 'W1', 'MN', '1Y']") && app.includes('syncTfBarForMode()'));
chk('engine expose tier & skor analis', eng.includes('PRO_MIN_SCORE') && eng.includes('signalTier') && eng.includes('analystScore') && eng.includes('detectLiquidityPools'));
chk('engine punya skor keyakinan netral-arah + spotOnly', eng.includes('convictionScore') && eng.includes('spotOnlyEffect') && eng.includes('SPOT_ONLY'));
chk('backtest melacak statistik per-arah (longWR/shortWR)', eng.includes('longWR') && eng.includes('shortWR'));
chk('papan TF tier-aware (★ ELITE / ✅ PRO)', app.includes("' ★ ELITE '") && app.includes("' ✅ PRO '"));
chk('radar menyaring keyakinan >= 55', app.includes('convictionScore, 0) >= 55'));
chk('kotak futures tidak untuk saham/spot', app.includes("a.assetClass !== 'stocks'") && app.includes('marginProduct'));
chk('toggle spot/futures tampak di semua aset (dipulihkan v2026.59)', !app.includes("showSub = a.assetClass === 'crypto'"));
chk('lock mengikat skor keyakinan (fix skor berubah saat refresh)', eng.includes('a.convictionScore = Math.max(a.convictionScore || 0, lock.score || 0)'));
chk('radar & kurasi investor auto-refresh mandiri', app.includes('startRadarAutoPilot') && app.includes('__radarAutoTimer') && app.includes('renderOpportunityRadar(force)') && app.includes('renderInvestorPicks(force)'));
chk('ticker realtime lewat bucket waktu resmi (bukan timpa candle terakhir)', !app.includes('lastBar.close = liveP') && app.includes('applyLiveTick(liveP'));
chk('pemilih tipe chart (candlestick/bar/line/area) ter-wire', html.includes('chartTypeBar') && html.includes('data-ctype="area"') && app.includes('applyChartType') && app.includes('mainSeriesPayload') && app.includes('updateMainSeries'));
chk('chart responsif HP (ResizeObserver + defer lebar 0)', app.includes('ResizeObserver') && app.includes('__chartInitPending'));
chk('pool radar 15 mnt & kurasi 30 mnt (rotasi penuh katalog)', app.includes('15 * 60000') && app.includes('1800000'));
chk('kartu rekomendasi membawa snapshot candle', app.includes('candles.slice(-240)'));
chk('klik-through memakai snapshot segar + lock create (konsistensi skor)', app.includes('primeFromRadarPool(sym, tf)') && app.includes("computeQuantEngine(state.candles, sym, tf || state.tf, false, 'create', primedSource)"));
chk('invalidasi lock butuh penerimaan harga (anti chop)', eng.includes('againstLong') && eng.includes('STRUCTURE_INVALID'));
chk('radar lebih segar: TTL 15 mnt + batch 40/slot 3 mnt', app.includes('15 * 60000') && app.includes('rotatingSlice(catalogSortedStable(), 40, 3)'));
chk('analisis workspace menulis-balik ke pool rekomendasi', app.includes('writeBackRadarPools(analysis)') && app.includes('WORKSPACE LIVE'));
chk('pindah mode memaksa rescan rekomendasi', app.includes('renderInvestorPicks(true)') && app.includes('renderOpportunityRadar(true)'));
chk('gate konfirmasi volume & squeeze breakout', eng.includes('volImpulse') && eng.includes('squeezeBlockedDir') && eng.includes('SQUEEZE_UNCONFIRMED'));
chk('tier memakai performa terkini (recentWinRate)', eng.includes('recentWinRate') && eng.includes('>= 70'));
chk('fundamental terukur (macroQuant) ada di output & UI', eng.includes('macroQuant') && app.includes('fmCycle') && app.includes('fmVolPct'));
chk('anti-desync: heartbeat canvas fallback terhubung ke tick live', app.includes('scheduleLiveCanvasRepaint()') && app.includes('window.drawCanvasFallbackChart = drawCanvasFallbackChart'));
chk('websocket crypto self-heal (onclose reconnect)', app.includes('ws.onclose') && app.includes('setTimeout(startBinanceStream, 3000)'));
chk('harga tampilan ikut walau candle belum siap', app.includes("setTxt('hdrLivePrice', formatPrice(price, state.symbol))"));
chk('cadangan anti-stall Binance ticker untuk crypto', app.includes("ticker/price?symbol=' + sym2.replace"));
chk('lock v3 per-TF + migrasi v2 (sinyal lama tidak dibuang)', app.includes("'xstarzg_siglock_v3'") && app.includes('__migratedV2') && app.includes("'|' + String(tf || state.tf || '')"));
chk('lifecycle outcome tercatat + cooldown pasca-SL', app.includes('recordSignalOutcome(symbol, tfA, verdict, lock)') && app.includes('signalCooldownActive(symbol, tfA)') && app.includes("'xstarzg_sigoutcome_v1'"));
chk('kartu radar ikut menerbitkan kunci (scope create/apply)', app.includes("(scope === 'create' || scope === 'apply') && a.signalEligible"));
chk('akurasi radar adaptif mengetatkan ambang terbit', app.includes('adaptiveMinScore(tfA)') && eng.includes('radarAdaptiveGate') && eng.includes('updateRadarAccuracy'));
chk('badge outcome jujur di kartu radar', app.includes('latestSignalOutcome(it.sym, it.tf)') && app.includes('eOutSl'));
chk('gate persistensi 2-candle anti fakeout', eng.includes('persistOk') && eng.includes('PERSIST_WAIT'));
chk('candle fabrikasi edge dicap jujur EST_ANCHORED', edgeAnalyze.includes("'EST_ANCHORED:'") && edgeAnalyze.includes('candle di fungsi ini DIFABRIKASI'));
chk('siklus hidup sinyal digerbang feed asli (feedIsReal)', app.includes('function feedIsReal(') && app.includes('if (!feedReal) a.feedUnverified = true;') && app.includes('if (feedReal && typeof SE.validateSignalLock'));
chk('kandidat feed estimasi dikeluarkan dari rekomendasi & badge-nya jelas', app.includes('a.__estFeed = !feedIsReal(d.source)') && app.includes('!it.analysis.__estFeed') && app.includes("T('ui.eEstFeed'"));
chk('rekonsiliasi outcome palsu -> lock dipulihkan', app.includes('reconcileSignalOutcome(symbol, tfA, closedBars0)') && app.includes('lock: lock ? {'));
chk('banner jujur saat radar kosong (pantauan bukan rekomendasi)', app.includes('noneQualified') && app.includes('eRadarNone'));
chk('kartu menyebut alasan gerbang (koherensi WR vs entry)', app.includes('gateShortLabel(a.gating.active[0])') && app.includes('gNoSeq'));
chk('panel menjelaskan WR besar tapi belum boleh entry', app.includes('eWrVsEntry'));
chk('peringatan risiko permanen (bukan nasihat keuangan) di semua halaman', html.includes('risk-disclaimer-bar') && html.includes('ui.eDisclaimer'));


/* v2026.51 DUAL-BRAIN lint */
chk('engine punya blok Dual-Brain versi benar', /DUAL-BRAIN\+ICT ATLAS \(2026\.52\)/.test(eng) && /brain === 'SCALP'/.test(eng) && /sniperPremiumVeto/.test(eng));
chk('engine level-ctx bawa brain + reasons brain', /oldLow: liqPools\.oldLow, brain/.test(eng) && /OTAK SCALP|SCALP Micro/.test(eng));
chk('app gate label dual-brain', /SCALP_PRESSURE: T\('ui\.gScalpPressure'/.test(app) && /SNIPER_STRUCTURE: T\('ui\.gSniperStruct'/.test(app));
chk('app panel badge otak', /eBrainScalp/.test(app) && /eBrainSniper/.test(app));
/* v2026.52 ICT ATLAS + MASTER MIND lint */
chk('engine ICT Atlas module', /ICT ATLAS \(v2026\.52\)/.test(eng) && /export function detectIctAtlas/.test(eng) && /function detectCISD/.test(eng) && /function detectAmdPhase/.test(eng));
chk('engine Master Mind profile', /MASTER MIND \(v2026\.52\)/.test(eng) && /riskPct/.test(eng) && /beAfterTp1/.test(eng));
chk('engine veto CISD/FOMO tersambung', /cisdCounterVeto/.test(eng) && /fomoVeto/.test(eng) && /CISD_COUNTER/.test(eng) && /riskPlan: masterProfile/.test(eng));
chk('app label gerbang + rencana master', /CISD_COUNTER: T\('ui\.gCISD'/.test(app) && /FOMO_ZONE: T\('ui\.gFomo'/.test(app) && /eRiskPlan/.test(app));
/* v2026.53 ADAPTIVE LIVE FEED lint */
chk('edge punya fetchYahooCandles + resample H4', /async function fetchYahooCandles/.test(edgeAnalyze) && /resampleCandles/.test(edgeAnalyze) && /YAHOO_CANDLES:/.test(edgeAnalyze));
chk('edge prioritas candle NYATA Yahoo sebelum fabrikasi', edgeAnalyze.indexOf('fetchYahooCandles(s, tf)') < edgeAnalyze.indexOf('buildBrokerAnchoredCandles(s, tf, liveQuote)'));
/* v2026.54 SELARAS lint: plafon skor direm per gerbang penolak */
chk('engine cap skor proporsional ke jumlah gerbang tolak', /gatesBlocked = gateReasons/.test(eng) && /59 - 2 \* gatesBlocked/.test(eng));
/* v2026.55b lint */
chk('engine cap investor NETRAL + DCA monotonic fair-value', /confluenceScore = Math\.min\(confluenceScore, 59\)/.test(eng) && /dcaZone2 = Math\.min\(dcaZone1/.test(eng) && /dcaZone3 = Math\.min\(dcaZone2/.test(eng));
chk('engine remove kondisi NEUTRAL dari cap trader', /mode === 'trader' && !eligible\) \{/.test(eng) && !/!eligible && softBias !== 'NEUTRAL'/.test(eng));
chk('label pillars diperbarui (26/10)', /26-Pillar|26 Pilar/.test(html));
/* v2026.56 lint: judul scan tidak lagi 'sinyal terbaik' yang ambigu */
chk('eGateBest judul status-scan jelas', /Status Scan Timeframe Terbaik/.test(app) && !app.includes('Sinyal Terbaik Saat Ini'));
/* v2026.57 NEWS lint */
chk('edge news endpoint ada & parse FF XML + bias map', /FOREXFACTORY/.test(edgeNews) && /buildImpacts/.test(edgeNews) && /etToUtc/.test(edgeNews));
chk('app fetch & render panel news', /function fetchNewsCalendar/.test(app) && /function renderNewsPanel/.test(app) && /newsGrid/.test(html));
chk('news risk chip radar & peringatan panel', /newsSoonFor/.test(app) && /eNewsWarn/.test(app));
/* v2026.58 GLOBAL MACRO lint */
chk('edge macro endpoint ada & classifyRegime', /classifyRegime/.test(edgeMacro) && /dcaWeights/.test(edgeMacro) && /'GOLDILOCKS'/.test(edgeNews+edgeMacro));
chk('app fetch/render macro + strip investor', /fetchMacroRegime/.test(app) && /renderMacroMap/.test(app) && /macroMapBox/.test(html));
chk('bobot DCA dinamis regime + konteks trader', /macroDcaWeights/.test(app) && /invDcaPace/.test(app) && /eMacroTrader/.test(app));
/* v2026.59 FITUR DIPULIHKAN lint */
chk('toggle Spot/Futures trader TIDAK disembunyikan lagi', !/showSub \? '' : 'none'/.test(app) && /btnSubFutures/.test(html));
chk('kalkulator posisi: panel HTML + widget boot + wiring levels', /id="calcPanel"/.test(html) && /resPosSizeUnits/.test(html) && /__calcWidget/.test(app) && /PositionCalculator/.test(engineBoot) && /class PositionCalculator/.test(calcMod));
chk('kalkulator memakai ATR & leverage + kunci calcTitle', /updateMarketContext/.test(calcMod) && /recalculate/.test(calcMod) && /calcTitle/.test(R('../public/i18n/locales/id.js')));
console.log(`APP-STATIC: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
