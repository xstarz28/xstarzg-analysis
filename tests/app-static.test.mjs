// Verifikasi statis integrasi app.js + index.html (Node, tanpa dependensi).
// Fokus: cache-bust versi, isolasi kalkulator dari generator sinyal, keberadaan
// wiring lock / scan multi-TF / gerbang, dan kesehatan i18n.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const R = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const html = R('../public/index.html');
const app = R('../public/app.js');
const boot = R('../public/js/engine-boot.js');
const i18nIndex = R('../public/i18n/index.js');
const eng = R('../public/js/shared/signal-engine.js');
const edgeAnalyze = R('../functions/api/market/analyze.js');
const edgeNews = R('../functions/api/news/calendar.js');
const edgeMacro = R('../functions/api/macro/regime.js');
const edgeMarket = R('../functions/api/market/analyze.js');
const edgeQuotes = R('../functions/api/market/quotes.js');
const calcMod = R('../public/js/calculator.js');
const engineBoot = R('../public/js/engine-boot.js');
const wrangler = R('../wrangler.toml');
const css = R('../public/styles.css');
const headers = R('../public/_headers');
const sw = R('../public/sw.js');
const tgRelay = R('../functions/api/notify/telegram.js');
const sentinelScript = R('../scripts/market-sentinel.mjs');
const sentinelWorkflow = R('../.github/workflows/market-sentinel.yml');
const journalApi = R('../functions/api/market/journal-sync.js');
const alarmApi = R('../functions/api/market/price-alarms.js');
const groupModule = R('../public/js/shared/group-analysis.js');

let passed = 0, failed = 0;
const chk = (n, c) => { if (c) { passed++; } else { failed++; console.log('FAIL:', n); } };

// --- Versi cache-bust ---
chk('index.html memakai v=2027.20 (styles)', /styles\.css\?v=2027\.20/.test(html));
chk('index.html memuat app.js v=2027.20 secara defer', /<script defer src="\/app\.js\?v=2027.20">/.test(html));
chk('quant engine tidak dimuat saat landing', !/<script type="module" src="\/js\/engine-boot\.js/.test(html) && app.includes("bootScript.src = '\/js/engine-boot.js?v=2027.20'") && app.includes('ensureQuantEnginesLoaded();'));
chk('index.html memakai v=2027.20 (i18n boot module)', /<script type="module" src="\/i18n\/boot\.js\?v=2027\.20">/.test(html));
chk('engine-boot import shared v=2027.20 (2x)', /quant-core\.js\?v=2027\.20/.test(boot) && /signal-engine\.js\?v=2027\.20/.test(boot));
chk('i18n index import locale v=2027.20', /locales\/\$\{currentLang\}\.js\?v=2027\.20/.test(i18nIndex));
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


chk('PWA cache dan mesin kuantitatif menggunakan lazy loading yang baru', sw.includes('xstarzg-pwa-v2027.20') && !/<script type="module" src="\/js\/engine-boot\.js/.test(html) && app.includes("bootScript.src = '\/js/engine-boot.js?v=2027.20'") && app.includes('ensureQuantEnginesLoaded();'));
chk('pemindaian Best TF otomatis dinonaktifkan', /function scheduleBestTfScan\(\) \{\s*return;/.test(app));
chk('cache candle radar memakai URL stabil tanpa timestamp unik', !/api\/market\/analyze\?symbol=' \+ encodeURIComponent\(symbol\) \+ '&tf=' \+ encodeURIComponent\(tf \|\| 'H1'\) \+ '&_t='/.test(app));
chk('expanded crypto catalog hanya dimuat saat kategori CRYPTO dipilih', app.includes("if (catSel.value === 'CRYPTO')") && app.includes('lazyLoadCryptoPairs()'));


chk('library chart hanya dimuat saat workspace dibuka', !/<script src="\/vendor\/lightweight-charts\.js/.test(html) && app.includes("chartScript.src = '/vendor/lightweight-charts.js?v=2027.20'") && app.includes('ensureChartVendorLoaded();'));


chk('timeframe switch retains last valid chart and cancels prior analysis fetch', (() => { const a = app.indexOf('/* ---- Timeframe bar ---- */'); const b = app.indexOf('/* ---- Tab filter & sort DEX Meme Radar */', a); const block = a >= 0 ? app.slice(a, b > a ? b : a + 2500) : ''; return block.includes('state.tf = tf') && !block.includes('state.candles = []') && app.includes('activeAnalysisController.abort()'); })());
chk('seed preview tidak menjalankan quant engine penuh', app.includes('function renderSeedCandlesPreview(candles)') && app.includes('Exactly one full quant pass per successful timeframe response.'));
chk('DEX workspace tetap manual tanpa scanner rekomendasi', html.includes('id="memeWorkspaceWrap"') && html.includes('id="selMemeChain"') && html.includes('id="inpMemeAddress"') && !html.includes('id="memeRadarSection"') && !html.includes('id="memePicksGrid"') && app.includes('searchManualDexToken'));

chk('feed sintetis hanya preview dan tidak menjalankan quant engine penuh', app.includes('feedIsEstimate(data.source)') && app.includes('FEED ESTIMASI — preview saja'));

// --- Wiring lock persisten (aturan #3.2) ---
chk('kunci storage siglock v2 ada', app.includes("'xstarzg_siglock_v2'"));
chk('multi-instrument recommendation engine is disabled', !app.includes("computeQuantEngine(d.candles, item.sym, item.tf, false, 'apply', d.source)") && /function fetchRadarCandidate\(\) \{\s*return Promise\.resolve\(null\);/.test(app) && !html.includes('id="opportunityRadarGrid"'));
chk('lock divalidasi sebelum diterapkan', app.includes('SE.validateSignalLock(') && app.includes('SE.applyLockedSignal('));
chk('journal accepts only manually selected high-score aligned setups', app.includes('var manualJournalEligible = state.manualInstrumentSelection === true') && app.includes("alignmentStatus === 'ALIGNED_BULLISH'") && app.includes("alignmentStatus === 'ALIGNED_BEARISH'") && app.includes("scope === 'create'") && app.includes('Math.max(80, adaptiveMinScore(tfA))'));

// --- Wiring scan multi-TF (aturan #2) ---
chk('pilihan timeframe manual tetap tersedia', ['M1','M5','M15','M30','H1','H4','D1','W1','MN'].every(tf => app.includes("'" + tf + "'")));
chk('pemindaian best-timeframe otomatis dinonaktifkan', /function scheduleBestTfScan\(\) \{\s*return;/.test(app));
chk('manual engine retains the user-selected timeframe', app.includes('state.tf') && app.includes('window.runFullAnalysis = async function') && app.includes('manualInstrumentSelection'));
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
chk('20 locale punya keyset ui seragam (758)', uniform && count === 758);
chk('panel radar multi-instrumen tidak ada pada workspace', !html.includes('traderRadarSection') && !html.includes('investorRadarSection') && !html.includes('opportunityRadarGrid'));
chk('kurasi Investor tidak otomatis menambahkan aset ke jurnal', /function syncCuratedInvestorToJournal\(\) \{[\s\S]*?return \[\];/.test(app));
chk('mode investor menyaring TF trader (D1/W1/MN/1Y)', app.includes("var INVESTOR_TFS = ['D1', 'W1', 'MN', '1Y']") && app.includes('syncTfBarForMode()'));
chk('engine expose tier & skor analis', eng.includes('PRO_MIN_SCORE') && eng.includes('signalTier') && eng.includes('analystScore') && eng.includes('detectLiquidityPools'));
chk('engine punya skor keyakinan netral-arah + spotOnly', eng.includes('convictionScore') && eng.includes('spotOnlyEffect') && eng.includes('SPOT_ONLY'));
chk('backtest melacak statistik per-arah (longWR/shortWR)', eng.includes('longWR') && eng.includes('shortWR'));
chk('best-timeframe scanner tidak aktif', /function scheduleBestTfScan\(\) \{\s*return;/.test(app));
chk('container radar Trader dan Investor sudah tidak ada', !html.includes('traderRadarSection') && !html.includes('investorRadarSection'));
chk('kotak futures tidak untuk saham/spot', app.includes("a.assetClass !== 'stocks'") && app.includes('marginProduct'));
chk('toggle spot/futures tampak di semua aset (dipulihkan v2026.59)', !app.includes("showSub = a.assetClass === 'crypto'"));
chk('lock mengikat skor keyakinan (fix skor berubah saat refresh)', eng.includes('a.convictionScore = Math.max(a.convictionScore || 0, lock.score || 0)'));
chk('autopilot rekomendasi browser dinonaktifkan', /function startRadarAutoPilot\(\) \{\s*return;/.test(app));
chk('ticker realtime lewat bucket waktu resmi (bukan timpa candle terakhir)', !app.includes('lastBar.close = liveP') && app.includes('applyLiveTick(liveP'));
chk('pemilih tipe chart (candlestick/bar/line/area) ter-wire', html.includes('chartTypeBar') && html.includes('data-ctype="area"') && app.includes('applyChartType') && app.includes('mainSeriesPayload') && app.includes('updateMainSeries'));
chk('chart responsif HP (ResizeObserver + defer lebar 0)', app.includes('ResizeObserver') && app.includes('__chartInitPending'));
chk('jadwal scan radar dan kurasi otomatis dinonaktifkan', /function startRadarAutoPilot\(\) \{\s*return;/.test(app) && /function scheduleBestTfScan\(\) \{\s*return;/.test(app));
chk('snapshot rekomendasi lama tidak dapat dipakai ulang', !app.includes('primeFromRadarPool(sym, tf)'));
chk('klik jurnal memicu analisis manual pada instrumen yang dipilih', app.includes('function gotoInstrument(sym, tf)') && app.includes('state.manualInstrumentSelection = true') && !app.includes('primeFromRadarPool(sym, tf)'));
chk('invalidasi lock butuh penerimaan harga (anti chop)', eng.includes('againstLong') && eng.includes('STRUCTURE_INVALID'));
chk('radar scan otomatis tidak dijadwalkan', /function startRadarAutoPilot\(\) \{\s*return;/.test(app));
chk('hasil analisis tidak ditulis ke pool rekomendasi', !app.includes('writeBackRadarPools(analysis)'));
chk('mode changes do not invoke recommendation renderers', (() => { const a = app.indexOf('function setMode(mode) {'); const b = app.indexOf('function setSubMode(sub) {', a); const block = app.slice(a, b); return a >= 0 && !block.includes('renderInvestorPicks(') && !block.includes('renderOpportunityRadar(') && !block.includes('renderMemePicks('); })());
chk('gate konfirmasi volume & squeeze breakout', eng.includes('volImpulse') && eng.includes('squeezeBlockedDir') && eng.includes('SQUEEZE_UNCONFIRMED'));
chk('tier memakai performa terkini (recentWinRate)', eng.includes('recentWinRate') && eng.includes('>= 70'));
chk('fundamental terukur (macroQuant) ada di output & UI', eng.includes('macroQuant') && app.includes('fmCycle') && app.includes('fmVolPct'));
chk('anti-desync: heartbeat canvas fallback terhubung ke tick live', app.includes('scheduleLiveCanvasRepaint()') && app.includes('window.drawCanvasFallbackChart = drawCanvasFallbackChart'));
chk('websocket crypto self-heal (onclose reconnect)', app.includes('ws.onclose') && app.includes('setTimeout(startBinanceStream, 3000)'));
chk('harga tampilan ikut walau candle belum siap', app.includes("setTxt('hdrLivePrice', formatPrice(price, state.symbol))"));
chk('cadangan anti-stall Binance ticker untuk crypto', app.includes("ticker/price?symbol=' + sym2.replace"));
chk('lock v3 per-TF + migrasi v2 (sinyal lama tidak dibuang)', app.includes("'xstarzg_siglock_v3'") && app.includes('__migratedV2') && app.includes("'|' + String(tf || state.tf || '')"));
chk('lifecycle outcome tercatat + cooldown pasca-SL', app.includes('recordSignalOutcome(symbol, tfA, verdict, lock)') && app.includes('signalCooldownActive(symbol, tfA)') && app.includes("'xstarzg_sigoutcome_v1'"));
chk('journal creation requires create scope and directional alignment', app.includes("scope === 'create'") && app.includes('directionAligned') && app.includes('manualJournalEligible'));
chk('ambang skor minimal jurnal adalah 80', app.includes('Math.max(80, adaptiveMinScore(tfA))'));
chk('siklus outcome jurnal tetap aktif tanpa kartu radar', app.includes('recordSignalOutcome(symbol, tfA, verdict, lock)') && app.includes('signalCooldownActive(symbol, tfA)'));
chk('gate persistensi 2-candle anti fakeout', eng.includes('persistOk') && eng.includes('PERSIST_WAIT'));
chk('candle fabrikasi edge dicap jujur EST_ANCHORED', edgeAnalyze.includes("'EST_ANCHORED:'") && edgeAnalyze.includes('candle di fungsi ini DIFABRIKASI'));
chk('siklus hidup sinyal digerbang feed asli (feedIsReal)', app.includes('function feedIsReal(') && app.includes('if (!feedReal) a.feedUnverified = true;') && app.includes('if (feedReal && typeof SE.validateSignalLock'));
chk('feed estimasi dan feed tidak terverifikasi dilarang masuk jurnal', app.includes('!a.__estFeed && !a.feedUnverified && feedReal'));
chk('rekonsiliasi outcome palsu -> lock dipulihkan', app.includes('reconcileSignalOutcome(symbol, tfA, closedBars0)') && app.includes('lock: lock ? {'));
chk('analisis menunggu pilihan instrumen manual dari pengguna', app.includes('if (!state.manualInstrumentSelection)') && app.includes('Pilih instrumen secara manual, lalu tekan Analisis.'));
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
chk('label pillars diperbarui (28/10)', /28-Pillar|28 Pilar|26-Pillar|26 Pilar/.test(html));
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
/* v2026.60 BUGFIX lint (feed + kalender) */
chk('banner ESTIMASI kini BENAR-BENAR reconnect (retry 45s)', /scheduleFeedReconnect/.test(app) && /feedReconnectTimer/.test(app));
chk('edge XAU spot pakai candle Yahoo NYATA (XAUUSD=X) tanpa pengecualian', /'XAU\/USD': \['XAUUSD=X'/.test(edgeMarket) && !/"XAU\/USD" && s !== 'XAU\/IDR'/.test(edgeMarket) && /if \(s !== 'XAU\/IDR'\)/.test(edgeMarket));
chk('kalender anti-kosong: mirror FF + stale-while-error + klien tak menghapus event', /FF_URLS/.test(edgeNews) && /cdn-nfs\.faireconomy/.test(edgeNews) && /stale: true/.test(edgeNews) && /j\.events\.length > 0 \|\| !newsState\.loaded/.test(app) && /CRYPTO_RSS_URLS/.test(edgeNews) && /cointelegraph/.test(edgeNews));
/* v2026.61 crypto multi-exchange lint */
chk('pair crypto non-Binance (HYPE dll) -> candle Bybit lalu OKX', /fetchBybitCandles/.test(edgeMarket) && /fetchOkxCandles/.test(edgeMarket) && /BYBIT:\$\{pair\}/.test(edgeMarket) && /OKX:\$\{instId\}/.test(edgeMarket) && edgeMarket.indexOf('fetchBinanceCandles(s, tf);\n    if (binData) return binData;\n    // v2026.61') > -1);
chk('quotes batch: ticker Bybit->OKX->Yahoo untuk pair non-Binance', /api\.bybit\.com\/v5\/market\/tickers/.test(edgeQuotes) && /www\.okx\.com\/api\/v5\/market\/ticker/.test(edgeQuotes));
/* v2026.62 lint: kalender selesai + zona struktur pivot */
chk('event lewat ditandai SELESAI + hasil aktual', /eNewsDone/.test(app) && /eNewsActual/.test(app) && /actual/.test(edgeNews) && /d < 0 \|\|/.test(app));
chk('pilar pivot menampilkan zona struktur psikologis', /psychRoundPrice/.test(app) && /ePtZone/.test(app));
/* v2026.63 lint: fallback canvas chart */
chk('fallback canvas punya AXIS HARGA (fxPriceAxis) & tag level (lvTag)', /function fxPriceAxis/.test(app) && /function lvTag/.test(app) && /FALLBACK VIEW — axis harga aktif/.test(app));
chk('fallback membaca level via effectiveLevels (bukan analysis.entry undefined)', /effectiveLevels\(analysis\)/.test(app) && !/drawLine\(analysis\.entry/.test(app));
chk('fallback menggambar overlay EMA/VWAP + harga terkini + toggle redraw', /__fxEmaList/.test(app) && /vwapN/.test(app) && /candleLastPrice/.test(app) && /window\.drawCanvasFallbackChart\(state\.candles, state\.lastAnalysis\)/.test(app));
/* v2026.64 lint: presisi harga micro-cap */
chk('formatPrice harga <1 pakai presisi signifikan (anti "0.00" RDNT)', /K\.floor\(Math\.log10\(a\)/.test(app) || /Math\.log10\(a\)/.test(app));
chk('LWC series menyesuaikan priceFormat per simbol (syncChartPriceFormat)', /function lwcPriceFormat/.test(app) && /syncChartPriceFormat\(\);/.test(app) && app.split('syncChartPriceFormat();').length >= 3);
/* v2026.65 lint jurnal sinyal + masa hidup horison */
chk('jurnal sinyal: section + renderer + wiring outcome', /id="signalJournalList"/.test(html) && /renderSignalJournal/.test(app) && /xstarzg_siglock_v3/.test(app));
chk('EXPIRED dicatat (bukan hilang diam-2) & ikut cooldown', /oc !== 'EXPIRED'/.test(app) && /status === 'EXPIRED'/.test(app) && /EXPIRED/.test(eng));
/* v2026.68 lint: jurnal clickable + billing server-side (auto-approve bertanda tangan) */
chk('kartu jurnal clickable -> gotoInstrument(sym, tf)', /jnl-card" data-sym/.test(app) && /list\.querySelectorAll\('\.radar-card\[data-sym\]'\)/.test(app) && /gotoInstrument\(card\.getAttribute\('data-sym'\)/.test(app) && /ui\.jnlOpen/.test(app));
chk('verifikasi VIP via SERVER /api/billing/verify-bsc (grant lokal dihapus)', app.includes("'/api/billing/verify-bsc'") && !/function clientVerifyBscPayment/.test(app) && /serverVerifyBscPayment/.test(app));
chk('sesi JWT publik /api/auth/register + dipanggil saat login', /api\/auth\/register/.test(app) && /function ensureAuthToken/.test(app) && /tvip|authToken/.test(app));
chk('server: verify-bsc WAJIB auth 401 + meneken entitlement VIP + anti-replay', /if \(!user \|\| !user\.email\)/.test(R('../functions/api/billing/verify-bsc.js')) && /tier: 'VIP', vipUntil/.test(R('../functions/api/billing/verify-bsc.js')) && /isTxUsed/.test(R('../functions/api/billing/verify-bsc.js')));
chk('endpoint register menerbitkan JWT FREE & tak pernah OWNER_VIP', /signJwt/.test(R('../functions/api/auth/register.js')) && /let tier = 'FREE'/.test(R('../functions/api/auth/register.js')));
chk('revalidasi sesi VIP saat boot (verifyVipSession + /api/auth/me)', /function verifyVipSession/.test(app) && /verifyVipSession\(\);/.test(app) && /api\/auth\/me/.test(app) && /authenticateRequest/.test(R('../functions/api/auth/me.js')));
chk('faktur invoice endpoint nyata + hidrasi modal', /onRequestGet/.test(R('../functions/api/billing/invoice.js')) && /hydrateVipInvoice/.test(app) && /id="vipInvoiceId"/.test(html) && /id="vipWalletAddr"/.test(html) && /ui\.payInvoiceId/.test(html));
chk('wrangler.toml mengikat D1 DB (database_id terkonfigurasi)', /\[\[d1_databases\]\][\s\S]*binding\s*=\s*"DB"[\s\S]*database_id\s*=\s*"d29a4547-d50e-42fb-a700-56364d967abb"/.test(wrangler));
/* v2026.68 HEMAT KUOTA CLOUDFLARE lint (paket gratis 100rb request/hari) */
chk('ticker 5 dtk + 0 request saat tab latar + crypto Binance-first', /RT_TICK_MS = 5000/.test(app) && /document\.hidden\) return;/.test(app) && /data-api\.binance\.vision\/api\/v3\/ticker\/price/.test(app));
chk('ticker tanpa cache-buster _t pada quote=1 (respons bisa di-cache)', !/analyze\?quote=1&symbol=' \+ encodeURIComponent\(sym\) \+ '&tf=' \+ encodeURIComponent\(tf\) \+ '&_t='/.test(app));
chk('radar and investor auto-scans are retired', /function startRadarAutoPilot\(\) \{\s*return;/.test(app) && /function scheduleBestTfScan\(\) \{\s*return;/.test(app) && !app.includes('rotatingSlice(catalogSortedStable(), 30, 4)'));
chk('edge analyze quote-only di-cache 4 dtk lintas-user', /caches\.default/.test(edgeAnalyze) && /max-age=4/.test(edgeAnalyze));
/* v2026.68 RESPONSIF MOBILE lint */
chk('responsif mobile: overflow-x hidden pada html & body + radar-card min-width 0', /html\s*\{[\s\S]*overflow-x:\s*hidden/.test(css) && /radar-card\s*\{[\s\S]*min-width:\s*0/.test(css) && /#inpSearchAsset/.test(css));
/* v2026.68 ZERO-RISK SL+ & DUAL-BRAIN MANAGEMENT lint */
chk('trade management SL+ 0-risk di gateBlockHtml & jurnal', /eSlPlusActive/.test(app) && /BE_SAVED/.test(app) && /jnlBeActive/.test(app) && /eScalpAdvisor/.test(app) && /eSniperAdvisor/.test(app));
/* DUAL FIBONACCI MATRIX & US STOCKS EXPANSION lint */
chk('Dual Fibonacci matrix HTML box & elemen nilai terpasang', /id="fiboMatrixBox"/.test(html) && /id="valFibo500"/.test(html) && /id="valFibo618"/.test(html) && /id="valFiboExt161"/.test(html));
chk('app.js mengupdate Fibo matrix & Pillar 10 Fibo', /valFibo618/.test(app) && /valFiboExt161/.test(app) && /goldenPocket/.test(app));
chk('signal-engine mengekspor calculateDualFibonacci & menyematkan fib pada levels', /export function calculateDualFibonacci/.test(eng) && /fib,/.test(eng));
/* VIP EXPIRY WARNING & OWNER SUBSCRIBERS LINT */
chk('banner peringatan kedaluwarsa VIP & modal pelanggan owner terpasang', /id="vipExpiryWarningBanner"/.test(html) && /id="ownerSubscribersModal"/.test(html) && /vipExpiryDaysText/.test(app));
chk('admin overview endpoint memverifikasi owner & query D1', /vip_entitlements/.test(R('../functions/api/admin/overview.js')) && /OWNER_EMAILS/.test(R('../functions/api/admin/overview.js')));
chk('quotaLimit & auth/me otomatis mendowngrade VIP kedaluwarsa ke FREE', /state\.user\.tier = 'FREE'/.test(app) && /out\.tier = 'FREE'/.test(R('../functions/api/auth/me.js')));
/* SMART SIGNAL & PRICE ALARM (v2026.69) lint */
chk('tombol alarm sinyal, chip status & toast notifikasi terpasang di HTML', /id="btnToggleSignalAlarm"/.test(html) && /id="alarmStatusChip"/.test(html) && /id="signalAlarmToast"/.test(html));
chk('engine alarm app.js: Web Audio chime, Web Notification & checkSignalAlarm terpasang', /playAlertChime/.test(app) && /checkSignalAlarm/.test(app) && /toggleSignalAlarm/.test(app));

/* PWA (PROGRESSIVE WEB APP) & 0-CLOUDFLARE CACHE LINT */
const manifestRaw = R('../public/manifest.webmanifest');
const swRaw = R('../public/sw.js');
chk('manifest PWA terpasang valid (standalone, start_url, theme_color)', /"display":\s*"standalone"/.test(manifestRaw) && /"start_url"/.test(manifestRaw) && /"theme_color"/.test(manifestRaw));
chk('service worker sw.js terpasang dengan cache bypass untuk /api/', /caches\.open/.test(swRaw) && /url\.pathname\.startsWith\('\/api\/'\)/.test(swRaw));
chk('HTML memuat link manifest & mobile app meta tags', /<link rel="manifest" href="\/manifest\.webmanifest"/.test(html) && /name="mobile-web-app-capable"/.test(html));
chk('app.js meregister service worker & menangani instalasi PWA', /navigator\.serviceWorker\.register\('\/sw\.js'\)/.test(app) && /beforeinstallprompt/.test(app) && /btnInstallPwa/.test(app));

/* SNIPER MINIMAL 1:2 R:R TARGET & 0-RISK ADVISORY LINT */
chk('jurnal menampilkan Target 1:2 R:R (TP2) untuk Sniper', /Target 1:2 R:R \(TP2\)/.test(app) && /isSniper/.test(app));
chk('advisory peringatan SL+ proteksi 0-Risk untuk setup sniper', /SNIPER ADVISOR: Target penuh minimal 1:2 R:R \(TP2\)/.test(app) && /0-RISK TERKUNCI/.test(app));

/* MANUAL-ONLY ANALYSIS / NO RECOMMENDATION ENGINES lint */
chk('UI radar Trader/Investor dihapus', !/id="(?:traderRadarSection|investorRadarSection|opportunityRadarGrid|investorPicksGrid)"/.test(html));
chk('macro context Investor tetap tersedia', html.includes('id="investorMacroContextSection"') && html.includes('id="macroMapBox"'));
chk('workspace manual Trader/Investor tetap tersedia', html.includes('id="traderInvestorWorkspaceWrap"') && html.includes('id="investorMacroContextSection"'));
chk('engine tidak melakukan analisis tanpa pilihan instrumen manual', app.includes('window.runFullAnalysis = async function') && app.includes('if (!state.manualInstrumentSelection)'));
chk('workspace entry tidak menghasilkan seed candles otomatis', app.includes('function enterWorkspace() {') && app.includes('if (!state.manualInstrumentSelection)'));
/* MULTI-EXCHANGE EXPANSION (BINGX & MEXC) GEMS & HERO STATS LINT */
chk('katalog crypto memuat token unggulan BingX & MEXC (KAS, SUPER, POPCAT, BRETT, VIRTUAL, SPX, RAY, OM)',
  /mkCrypto\('KAS'/.test(R('../public/js/shared/quant-core.js')) &&
  /mkCrypto\('SUPER'/.test(R('../public/js/shared/quant-core.js')) &&
  /mkCrypto\('POPCAT'/.test(R('../public/js/shared/quant-core.js')) &&
  /mkCrypto\('BRETT'/.test(R('../public/js/shared/quant-core.js')) &&
  /mkCrypto\('VIRTUAL'/.test(R('../public/js/shared/quant-core.js')));

chk('dashboard depan & bar pilihan menampilkan 700+ instrumen dan 500+ pair crypto',
  /id="heroTotalInstruments">700\+<\/span>/.test(html) &&
  /id="heroCryptoCount">500\+<\/span>/.test(html) &&
  /700\+\s*Aset Aktif/.test(html) &&
  /75 Utama \+ 500\+ Pair/.test(html));

/* SEO, SEARCH ENGINE & AI BOT DISCOVERY (GOOGLE, BING, PERPLEXITY, OPENAI) LINT */
const robotsTxt = R('../public/robots.txt');
const sitemapXml = R('../public/sitemap.xml');
chk('robots.txt mengizinkan Googlebot, Bingbot & AI bots (GPTBot, PerplexityBot)',
  /User-agent:\s*Googlebot/i.test(robotsTxt) &&
  /User-agent:\s*Bingbot/i.test(robotsTxt) &&
  /User-agent:\s*GPTBot/i.test(robotsTxt) &&
  /User-agent:\s*PerplexityBot/i.test(robotsTxt) &&
  /Sitemap:\s*https:\/\/xstarzganalysis\.pages\.dev\/sitemap\.xml/.test(robotsTxt));

chk('sitemap.xml valid XML dengan URL halaman utama produksi',
  /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(sitemapXml) &&
  /<loc>https:\/\/xstarzganalysis\.pages\.dev\/<\/loc>/.test(sitemapXml));

chk('index.html memuat meta SEO, canonical, OpenGraph, Twitter Card & Google verification',
  /name="description"/.test(html) &&
  /name="keywords"/.test(html) &&
  /rel="canonical"/.test(html) &&
  /name="robots"\s+content="index,\s*follow/.test(html) &&
  /property="og:title"/.test(html) &&
  /property="og:image"/.test(html) &&
  /name="twitter:card"/.test(html) &&
  /content="QK9_DVUmbva2pfdj4DWK_qWRlyWfKnrXWvYizARwA-o"/.test(html));

chk('index.html memuat Schema.org JSON-LD WebApplication terstruktur untuk Google & AI Knowledge Graph',
  /<script type="application\/ld\+json">/.test(html) &&
  /"@type":\s*"WebApplication"/.test(html) &&
  /"name":\s*"XStarZG Analysis"/.test(html) &&
  /"applicationCategory":\s*"FinanceApplication"/.test(html));

/* MANUAL DEX WORKSPACE lint */
const memeApi = R('../functions/api/scanner/meme.js');
chk('DEX radar scanner UI dihapus tetapi workspace manual tetap ada', html.includes('id="memeWorkspaceWrap"') && html.includes('id="selMemeChain"') && html.includes('id="inpMemeAddress"') && !html.includes('id="memeRadarSection"') && !html.includes('id="memePicksGrid"'));
chk('DEX discovery endpoint sudah dinonaktifkan', memeApi.includes('status: 410') && memeApi.includes('disabled: true'));
chk('chart, teknikal, dan data keamanan DEX tetap tersedia', html.includes('id="memeCandleCanvas"') && html.includes('id="memeTechBody"') && html.includes('id="memeFundGrid"'));
chk('DEX mencari pair berdasarkan alamat manual dan tidak auto-pick token', html.includes('id="btnMemeSearch"') && app.includes('function searchManualDexToken()') && app.includes('var token = activeMemeToken;'));
chk('dashboard tidak lagi mengiklankan anti-rug scanner', !html.includes('ANTI-RUG SCANNER') && html.includes('ANALISIS MANUAL'));
/* ANALISIS INSTRUMEN PER KELOMPOK (PSIKOLOGI • TEKNIKAL • FUNDAMENTAL, SNIPER MTF) */
chk('section analisis per kelompok tersedia untuk trader & investor',
  html.includes('id="groupAnalysisSection"') && html.includes('id="groupAnalysisBody"') &&
  app.includes('function renderGroupAnalysis(') && app.includes("renderGroupAnalysisInto('groupAnalysisBody'"));
chk('workspace DEX memakai analisis kelompok sniper MTF yang sama',
  html.includes('id="memeGroupAnalysis"') && app.includes('function renderMemeGroupAnalysis(') &&
  app.includes('window.XSGroup.buildGroupAnalysis'));
chk('skor sniper hanya menjumlahkan konfluensi searah (tanpa menumpuk semua indikator)',
  groupModule.includes('only sums aligned confluences') && groupModule.includes('const scored = [') &&
  groupModule.includes('counted: false') && groupModule.includes('buildGroupAnalysis'));
chk('pindah mode langsung menampilkan panel workspace aktif tanpa menunggu analisis baru',
  app.includes("if (traderPanel) traderPanel.classList.toggle('hidden', isInv || isMeme || isNews || isJournal || isPerf);") &&
  app.includes("if (invPanel) invPanel.classList.toggle('hidden', !isInv);") &&
  app.includes("if (perfWrap) perfWrap.classList.toggle('hidden', !isPerf);"));
chk('sesi menyimpan & memulihkan pilihan instrumen manual agar chart tidak tertahan seed setelah refresh',
  app.includes('manualSelection: state.manualInstrumentSelection === true') &&
  app.includes('if (saved.manualSelection === true ||') &&
  app.includes('state.manualInstrumentSelection = true;') &&
  app.includes('if (isInWork && state.manualInstrumentSelection && !state.lastAnalysis &&'));
chk('pindah workspace tidak mengecilkan kanvas chart menjadi 0x0 (chart kosong)',
  !/chartInstance\.resize\(\)\s*;/.test(app) &&
  app.includes('function ensureChartSized()') &&
  app.includes('chartInstance.applyOptions({ width: w, height: h || 470 });') &&
  app.includes("height: chartBox.clientHeight || 470"));
chk('modul analisis kelompok dimuat lewat engine-boot berversi baru',
  engineBoot.includes('/js/shared/group-analysis.js?v=2027.20') && engineBoot.includes('window.XSGroup'));
/* JURNAL SINYAL REAL-TIME MONITORING MENUJU TP/SL & COTTON M5 FIX */
chk('jurnal sinyal memantau pergerakan harga real-time menuju TP/SL',
  app.includes('function monitorLiveSignalProgress(') &&
  app.includes('liveMonitorInfo') &&
  app.includes('scheduleLiveJournalUpdate') &&
  app.includes('monitorLiveSignalProgress(state.symbol, state.tf, price, bar.high, bar.low);'));

chk('sinyal workspace trader terdaftar ke siklus kunci jurnal walau feed cadangan',
  app.includes("scope === 'create' || getSignalLock(symbol, tfA)") &&
  app.includes('if (a.feedUnverified) nl.feedUnverified = true;') &&
  app.includes('saveSignalLock(symbol, tfA, nl);'));

chk('saveSignalLock dan renderAllVisuals memicu pembaruan jurnal seketika',
  app.includes('localStorage.setItem(journalStorageKey(SIGNAL_LOCK_KEY), JSON.stringify(all));') &&
  app.includes('try { renderSignalJournal(); } catch (e) {}\n}'));

chk('ticker komoditas kapas COTTON terpetakan lengkap di TradingView dan Yahoo',
  edgeAnalyze.includes("'COTTON': ['ICEUS:CT1!', 'NYBOT:CT1!', 'TVC:COTTON']") &&
  edgeAnalyze.includes("'COTTON': ['CT=F', 'TT=F', 'BAL']"));

chk('anti-dot spread floor & validasi skala harga di analyze.js dan app.js',
  edgeAnalyze.includes('flatCount > candles.length * 0.35') &&
  edgeAnalyze.includes('minSpread = Math.max(c.close * 0.0016, 0.0001)') &&
  edgeAnalyze.includes('live > expectedP * 3.5 || live < expectedP * 0.28') &&
  app.includes('var minSp = Math.max(cl * 0.0016, 0.0001);') &&
  app.includes('baseP = (meta && Number(meta.basePrice) > 0) ? Number(meta.basePrice) : (SEED_PRICES[sym] || 100);'));

chk('COTTON M5 masuk daftar radar scalping & dipantau aktif',
  app.includes("{ sym: 'COTTON', tf: 'M5' }") &&
  app.includes("monitorLiveSignalProgress(state.symbol, state.tf, price, bar.high, bar.low);"));

chk('lokalisasi jurnal sinyal bebas bahasa Indonesia saat English aktif',
  app.includes('function localizeJournalReason(reason)') &&
  app.includes("Saved by SL+ protection (0-Risk, capital safe)") &&
  app.includes("isEn ? '🛡️ SL+ ACTIVE (0-RISK)' : '🛡️ SL+ AKTIF (0-RISK)'") &&
  app.includes("isEn ? 'towards TP' : 'menuju TP'"));

chk('integritas anti-fake TP: harga NZD/JPY 2026, verifikasi keterisian limit & audit outcome',
  app.includes("'NZD/JPY': 87.35") &&
  edgeAnalyze.includes("'NZD/JPY': 87.35") &&
  app.includes('lock.feedUnverified && isCurrentFeedReal') &&
  app.includes('Target tercapai sebelum order limit terjemput (unfilled)') &&
  app.includes('auditAndCleanseCorruptedStorage'));

chk('kalender ekonomi & jurnal sinyal mandiri (terpisah dari dashboard analisa utama)',
  html.includes('id="newsWorkspaceWrap"') &&
  html.includes('id="journalWorkspaceWrap"') &&
  html.includes('id="btnModeNews"') &&
  html.includes('id="btnModeJournal"') &&
  app.includes("state.mode === 'news'") &&
  app.includes("state.mode === 'journal'"));

chk('sinkronisasi mutlak chart & keterangan panel via effectiveLevels oc.lock + SEI/USDT seed',
  app.includes("'SEI/USDT': 0.28") &&
  app.includes("if (oc && oc.lock && (oc.status === 'TP_HIT' || oc.status === 'SL_HIT' || oc.status === 'BE_SAVED'))") &&
  app.includes("formatPrice(tp1, symbol)") &&
  eng.includes("const minTp1R = brainMode === 'SCALP' ? 2.0 : 1.0;") &&
  eng.includes("const tp1Pad = brainMode === 'SCALP' ? 2.0 : 1.1;"));

chk('institutional confluence matrix & sentiment flow terminal widgets',
  html.includes('id="confluenceMatrixBox"') &&
  html.includes('id="confluenceMatrixGrid"') &&
  html.includes('id="sentimentFlowBox"') &&
  html.includes('id="sentimentIndexVal"') &&
  html.includes('id="smartMoneyFlowTxt"') &&
  app.includes('function renderConfluenceMatrix(a)') &&
  app.includes('function renderSentimentFlow(a)'));

chk('integritas feed forex real-time EUR/USD M5 & proteksi sinyal anti-estimasi',
  edgeAnalyze.includes('flatThresh = isForex ? 0.000005 : (lastClose * 0.0004)') &&
  edgeAnalyze.includes("s === 'EUR/USD' || s === 'GBP/USD'") &&
  edgeAnalyze.includes("query2.finance.yahoo.com") &&
  app.includes("isEst ? '--' : formatPrice(L.entry, a.symbol)") &&
  app.includes("if ((scope === 'create' || getSignalLock(symbol, tfA)) && !isFeedEstimate) feedReal = true;"));

chk('radar rekomendasi saham IDX & global lancar tanpa freeze atau memuat abadi',
  edgeAnalyze.includes("symbol.endsWith('.JK') && (tf === 'M1' || tf === 'M5' || tf === 'M15' || tf === 'M30')") &&
  edgeAnalyze.includes("'Cache-Control': 'public, max-age=12'") &&
  app.includes("{ sym: 'BBCA.JK', tf: 'M15' }") &&
  app.includes("{ sym: 'BBCA.JK', tf: 'H1' }") &&
  app.includes("{ sym: 'BBCA.JK', tf: 'D1' }"));

chk('pencarian manual jurnal sinyal (filter instan tanpa scroll panjang)',
  html.includes('id="inpJournalSearch"') &&
  html.includes('id="btnJournalClearSearch"') &&
  app.includes("$id('inpJournalSearch')") &&
  app.includes("$id('btnJournalClearSearch')") &&
  app.includes('filteredRows = rows.filter('));

chk('sistem notifikasi otomatis SL+ 0-risk (Web Notification + audio chime + visual toast)',
  html.includes('id="btnToggleSlPlusNotify"') &&
  app.includes('notifySlPlusTriggered') &&
  app.includes('toggleSlPlusNotification') &&
  app.includes('sendBrowserPushNotification') &&
  app.includes('xstarzg_slplus_notify_v1'));

chk('proteksi kontaminasi silang harga antar-pair (anti-terjebak harga pair sebelumnya)',
  app.includes('function isPriceCompatibleWithSymbol(') &&
  app.includes('getSymbolReferencePrice(') &&
  app.includes('analysisRequestSeq') &&
  app.includes('mySeq !== analysisRequestSeq || state.symbol !== reqSymbol') &&
  app.includes('!isPriceCompatibleWithSymbol(lastBar.close, reqSymbol)') &&
  app.includes('saveSignalLock(symbol, tf, null);') &&
  eng.includes('Skala harga sinyal tidak cocok dengan candle pair (kontaminasi silang antar pair)') &&
  eng.includes('const aSym = String(a.symbol || \'\').toUpperCase();') &&
  eng.includes('if (aSym && lSym && aSym !== lSym) return a;'));

chk('Cloud Sentinel hanya memantau posisi manual aktif dan tidak melakukan discovery',
  sentinelScript.includes('monitorOnly = false') &&
  sentinelScript.includes('scanInstrument(inst, cache, { monitorOnly = false, journalLockKey } = {})') &&
  sentinelScript.includes('scanInstrument(target.inst, cache, { monitorOnly: true, journalLockKey: target.journalLockKey })') &&
  sentinelScript.includes('!doctrineBlocked && !monitorOnly && a.signalEligible') &&
  sentinelScript.includes("import { evaluateDoctrine } from '../public/js/shared/trading-doctrine.js'") &&
  sentinelScript.includes('const activeLocks = Object.entries(cache.slPlusLocks || {})') &&
  sentinelScript.includes('const monitorTargets = activeLocks.map') &&
  sentinelScript.includes('WATCHLIST.find(inst => inst.sym === lock.symbol && inst.tf === lock.tf)') &&
  sentinelWorkflow.includes('XStarZG 24/7 Manual Position Monitor') &&
  sentinelWorkflow.includes("cron: '*/5 * * * *'") &&
  sentinelWorkflow.includes('TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}') &&
  sentinelWorkflow.includes('TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}'));
chk('kredensial Sentinel tidak di-hardcode dan hanya dibaca dari environment secret',
  sentinelWorkflow.includes('SENTINEL_SECRET: ${{ secrets.SENTINEL_SECRET }}') &&
  !sentinelWorkflow.includes("SENTINEL_SECRET: '") &&
  sentinelScript.includes('function getSentinelSecret()') &&
  !sentinelScript.includes("process.env.SENTINEL_SECRET || 'xstarzg-2026-quant-secret'") &&
  journalApi.includes('env.SENTINEL_SECRET && sentinelKey === env.SENTINEL_SECRET'));

chk('bot Telegram mengabari peluang skor besar, TP bertahap, dan alarm lonceng dari cloud',
  sentinelScript.includes('export async function announceJournalEntry') &&
  sentinelScript.includes('announcedHighScoreAt') &&
  sentinelScript.includes('// 2d. Take Profit bertahap') &&
  sentinelScript.includes('TAKE PROFIT 2 TERCAPAI') &&
  sentinelScript.includes('TARGET TP3 TERCAPAI') &&
  sentinelScript.includes('notifiedTp2') &&
  sentinelScript.includes('syncActiveAlarmsFromCloud') &&
  sentinelScript.includes('/api/market/price-alarms') &&
  sentinelScript.includes('inferInstrument(lock.symbol, lock.tf)') &&
  alarmApi.includes('cloud_price_alarms') &&
  app.includes("syncCloudPriceAlarm('save')") &&
  app.includes("syncCloudPriceAlarm('remove')") &&
  app.includes("'/api/market/price-alarms'"));
chk('pembersihan fitur konek tele browser dari web ui (sepenuhnya otonom di cloud)',
  !html.includes('id="btnOpenTelegramModal"') &&
  !html.includes('id="btnOpenTelegramModalJnl"') &&
  !html.includes('id="telegramConfigModal"'));

chk('pengiriman notifikasi bot telegram live SL+ & sinyal institusional skor besar',
  app.includes('xstarzg_telegram_config_v1') &&
  app.includes('function loadPersistedTelegramConfig()') &&
  app.includes('function savePersistedTelegramConfig()') &&
  app.includes('function sendTelegramAlert(') &&
  app.includes('function checkTelegramHighScoreSignal(') &&
  app.includes('SL+ TERPICU — 0-RISK ALERT') &&
  app.includes('PELUANG BARU SKOR BESAR') &&
  app.includes('api.telegram.org/bot') &&
  tgRelay.includes('export async function onRequestPost({ request, env })') &&
  tgRelay.includes('api.telegram.org'));

chk('validasi input token/chatId & penanganan error spesifik telegram (anti-encodeURIComponent colon)',
  app.includes('function formatTelegramError(') &&
  app.includes('function validateTelegramInputs(') &&
  app.includes("replace(/^bot/i, '')") &&
  !app.includes("encodeURIComponent(token)") &&
  !tgRelay.includes("encodeURIComponent(cleanToken)") &&
  app.includes("https://api.telegram.org/bot' + token + '/sendMessage") &&
  tgRelay.includes("https://api.telegram.org/bot${cleanToken}/sendMessage"));

const tgLinkFn = R('../functions/api/notify/telegram-link.js');
const tgWebhookFn = R('../functions/api/notify/telegram-webhook.js');
const tgSubsFn = R('../functions/api/notify/telegram-subscribers.js');
const tgSql = R('../migrations/0002_telegram_subscribers.sql');

chk('arsitektur 1 official bot multi-user dengan vip gating & paywall di web ui',
  html.includes('id="btnTelegramVipAccess"') &&
  html.includes('id="btnTelegramVipAccessJnl"') &&
  html.includes('id="telegramVipModal"') &&
  html.includes('id="tgVipPaywallBlock"') &&
  html.includes('id="tgVipActiveBlock"') &&
  html.includes('id="btnUpgradeToVipForTg"') &&
  app.includes('openTelegramVipModal()') &&
  app.includes('closeTelegramVipModal()') &&
  app.includes("btnUpgradeTg.addEventListener('click'") &&
  app.includes("isVip = isOwner || isAffiliate || (curUser && curUser.tier === 'VIP'"));

chk('endpoint otentikasi & deep-link telegram vip serta webhook proteksi orang luar',
  tgLinkFn.includes('isPrivilegedVip(user') &&
  tgLinkFn.includes('upgradeRequired: true') &&
  tgLinkFn.includes('https://t.me/') &&
  tgWebhookFn.includes('AKSES DITOLAK — KHUSUS MEMBER VIP XSTARZG') &&
  tgWebhookFn.includes('SELAMAT! AKUN TELEGRAM ANDA BERHASIL TERVERIFIKASI') &&
  tgWebhookFn.includes('INSERT INTO telegram_subscribers') &&
  tgSubsFn.includes('SELECT chat_id, email, tier, vip_until, is_owner, is_affiliate') &&
  tgSql.includes('CREATE TABLE IF NOT EXISTS telegram_subscribers'));

chk('market sentinel hanya berjalan via cron/manual, bukan setiap push kode',
  !sentinelWorkflow.includes('  push:') &&
  sentinelWorkflow.includes("cron: '*/5 * * * *'") &&
  !sentinelWorkflow.includes("cron: '*/15 * * * *'") &&
  !sentinelWorkflow.includes("cron: '*/30 * * * *'") &&
  !sentinelWorkflow.includes("cron: '15,45 * * * *'") &&
  sentinelWorkflow.includes('workflow_dispatch:') &&
  sentinelWorkflow.includes('cancel-in-progress: false'));

chk('market sentinel broadcast multi-user ke seluruh subscriber vip dari d1',
  sentinelScript.includes('getActiveSubscribers()') &&
  sentinelScript.includes('sendTelegramMessage(') &&
  sentinelScript.includes('/api/notify/telegram-subscribers') &&
  sentinelScript.includes('X-Sentinel-Key'));

/* --- Pembaruan: jurnal berjalan, order konsisten, skor sniper tunggal, bahasa, performance --- */
const doctrineModule = R('../public/js/shared/trading-doctrine.js');
chk('jurnal menampilkan posisi berjalan (PENDING_FILL / FILLED), bukan hanya ACTIVE',
  app.includes('var RUNNING_STATUS = { ACTIVE: 1, PENDING_FILL: 1, FILLED: 1, OPEN: 1 };') &&
  app.includes("PENDING_FILL: ['#f59e0b'") &&
  app.includes("FILLED: ['#10b981'") &&
  app.includes('var isRunning = r.st === \'ACTIVE\' || r.st === \'PENDING_FILL\' || r.st === \'FILLED\';'));
chk('jurnal memulihkan simbol dari id lock agar baris terhitung tidak tampil tanpa instrumen',
  app.includes("var symFromKey = function (key) { return String(key || '').split('|')[0].toUpperCase(); };") &&
  app.includes('var oSym = String(o.lock.symbol || symFromKey(k2) || \'\').toUpperCase();'));
chk('hasil akhir sinyal dari cloud ikut disinkronkan ke jurnal perangkat',
  app.includes('var cloudOutcomes = Array.isArray(d.recentOutcomes) ? d.recentOutcomes') &&
  app.includes('localOuts[lid] = {'));
chk('satu keputusan order: Tipe Order dan Aksi Order tidak boleh bertentangan',
  app.includes("var orderVerb = orderType.replace(") &&
  app.includes('orderInstruction = isEn') &&
  app.includes("if (isNow) return 'Eksekusi '"));
chk('skor sniper memakai skor konfluensi resmi saat sinyal resmi terbit (anti skor ganda)',
  groupModule.includes('const officialSignal = safeGroup === \'trader\' && analysis &&') &&
  groupModule.includes('const score = officialScore == null ? criteriaScore : officialScore;') &&
  groupModule.includes("execution: { timeframe: 'M5/M1', bias: execBias, confirmed: execConfirmed }"));
chk('doktrin internal 4 pilar ada dan dipakai sentinel tanpa dirender di dashboard',
  doctrineModule.includes('export function evaluateDoctrine') &&
  doctrineModule.includes('MARKET ANALYSIS') &&
  doctrineModule.includes('RISK MANAGEMENT') &&
  sentinelScript.includes('evaluateDoctrine({ analysis: a })') &&
  !html.includes('evaluateDoctrine'));
chk('bahasa mengikuti sistem perangkat dan jatuh ke English bila tidak tersedia',
  i18nIndex.includes("export const FALLBACK_LANGUAGE = 'en';") &&
  i18nIndex.includes('function browserLanguageTags()') &&
  i18nIndex.includes('export function resolveLanguage(tag)') &&
  i18nIndex.includes('return FALLBACK_LANGUAGE;') &&
  !i18nIndex.includes("  // Default mutlak Bahasa Indonesia"));
chk('notifikasi sentinel jatuh ke English bila bahasa penerima tidak dikenal',
  sentinelScript.includes("const lang = typeof rec === 'object' ? (rec.lang || 'en') : 'en';"));
chk('halaman Performance & Track Record tersedia dan dihitung dari jurnal',
  html.includes('id="performanceWorkspaceWrap"') &&
  html.includes('id="perfCurve"') &&
  html.includes('id="btnModePerformance"') &&
  html.includes('id="perfBotBlock"') &&
  app.includes('function computePerformanceStats()') &&
  app.includes('function renderPerformancePage()') &&
  app.includes('function fetchBotPerformance()') &&
  app.includes('PERF_R_BY_STATUS'));
chk('track record bot publik punya endpoint sendiri dan hanya membaca sinyal sentinel yang sudah ditutup',
  fs.existsSync(new URL('../functions/api/market/performance.js', import.meta.url)) &&
  R('../functions/api/market/performance.js').includes("WHERE channel = 'sentinel' AND status != 'ACTIVE'") &&
  R('../functions/api/market/performance.js').includes('export function aggregatePerformance'));
chk('lock bot tanpa id tetap tersimpan dengan id deterministik (jurnal cloud tidak lagi kosong)',
  journalApi.includes('const id = item.id ? String(item.id) : scopeId(scope, item.symbol, item.tf);') &&
  journalApi.includes("WHERE id = ?5 AND (channel = 'sentinel' OR (channel = 'user' AND owner_email IN"));
chk('workspace investor dibatasi ke saham dan crypto dengan penjelasan DCA eksplisit',
  app.includes("return inst.assetClass === 'stocks' || inst.assetClass === 'crypto';") &&
  html.includes('id="lblInvDcaHowBody"') &&
  app.includes("var dcaStepLabels = ["));

let syntaxOk = false;
try {
  execSync('node -c public/app.js public/js/engine-boot.js public/js/calculator.js public/js/shared/quant-core.js public/js/shared/signal-engine.js public/i18n/index.js public/i18n/boot.js functions/api/notify/telegram.js functions/api/notify/telegram-link.js functions/api/notify/telegram-webhook.js functions/api/notify/telegram-subscribers.js scripts/market-sentinel.mjs tests/telegram-vip.test.mjs', { stdio: 'pipe' });
  syntaxOk = true;
} catch (e) {
  syntaxOk = false;
}
chk('sintaks JavaScript browser 100% valid tanpa syntax error (anti-freeze saat Ctrl+F5)', syntaxOk);

console.log(`APP-STATIC: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
