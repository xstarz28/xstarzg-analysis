'use strict';
// === PWA & MOBILE AUTO-ENTRY / DELEGATED CLICK GUARD ===
var SESSION_KEY = 'xstarzg_user_v3';

// Definisi state global awal di baris 3 agar seketika tersedia bagi semua handler tombol
var state = {
  symbol: 'XAU/USD',
  tf: 'H1', timeframe: 'H1',
  mode: 'trader',            // 'trader' | 'investor'
  manualInstrumentSelection: false,
  subMode: 'futures',        // 'futures' | 'spot'
  chartType: 'candles',      // 'candles' | 'bars' | 'line' | 'area' (ala TradingView)
  radarHorizon: 'intraday',  // 'scalping' | 'intraday' | 'swing'
  radarGroup: 'all',         // 'all' | 'crypto' | 'fx_comm' | 'stocks' (3 bagan terpisah)
  radarViability: 'actionable', // 'actionable' (layak entry) | 'fresh' | 'running' | 'all'
  bestTfBoard: null,         // papan hasil scan multi-TF (engine), diisi async
  candles: [],
  lastAnalysis: null,
  livePrice: 2680.00,
  liveChangePct: 0.25,
  feedSource: '-',
  user: null                 // { email, name, tier: 'GUEST'|'FREE'|'VIP'|'OWNER_VIP', vipUntil }
};
try { if (typeof window !== 'undefined') window.state = state; } catch (e) {}

// Fungsi alur layar & workspace terdefinisi seketika di baris awal (0ms delay),
// agar SEMUA klik tombol di landing page langsung merespons tanpa menunggu seluruh file besar selesai di-parse.
function showScreen(name) {
  try {
    var front = document.getElementById('frontLandingScreen');
    var gate = document.getElementById('loginGateScreen');
    var work = document.getElementById('appWorkspaceWrapper');
    if (front) {
      if (name === 'front') front.classList.remove('hidden'); else front.classList.add('hidden');
    }
    if (gate) {
      if (name === 'gate') gate.classList.remove('hidden'); else gate.classList.add('hidden');
    }
    if (work) {
      if (name === 'work') {
        work.classList.remove('hidden');
        var sk = document.getElementById('tvChartLoadingSkeleton');
        if (sk) { try { sk.style.display = 'none'; } catch (e) {} }
      } else {
        work.classList.add('hidden');
      }
    }
    var dd = document.getElementById('userProfileDropdown');
    if (dd) dd.classList.add('hidden');
    try { window.scrollTo({ top: 0 }); } catch (e) {}
  } catch (e) {}
}
if (typeof window !== 'undefined') window.showScreen = showScreen;

function saveSession() {
  if (!state || !state.user) return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      v: 4,
      user: state.user,
      symbol: state.symbol || 'XAU/USD', tf: state.tf || 'H1', mode: state.mode || 'trader', subMode: state.subMode || 'futures',
      radarHorizon: state.radarHorizon || 'intraday', at: Date.now()
    }));
    var tok = (state.user && (state.user.ownerToken || state.user.authToken)) || '';
    if (tok) localStorage.setItem('xstarzg_jwt', tok);
  } catch (e) {}
}

function loadSession() {
  try {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    var p = JSON.parse(raw);
    if (!p) return null;
    var user = p.user || (p.email ? p : null);
    if (!user || !user.email) return null;
    if (user.tier === 'VIP' && user.vipUntil && Date.now() > user.vipUntil) user.tier = 'FREE';
    p.user = user;
    var tok = (user.ownerToken || user.authToken) || '';
    if (tok) {
      try { localStorage.setItem('xstarzg_jwt', tok); } catch (e) {}
    }
    return p;
  } catch (e) { return null; }
}

var __xsChartVendorRequested = false;
function ensureChartVendorLoaded() {
  try {
    if (typeof LightweightCharts !== 'undefined' || __xsChartVendorRequested) return;
    __xsChartVendorRequested = true;
    var chartScript = document.createElement('script');
    chartScript.src = '/vendor/lightweight-charts.js?v=2026.88';
    chartScript.onload = function () {
      try {
        if (!chartInstance && typeof initChart === 'function') initChart();
        if (chartInstance && state.candles && state.candles.length && typeof renderAllVisuals === 'function') {
          renderAllVisuals(state.lastAnalysis || null, true);
        }
      } catch (e) {}
    };
    chartScript.onerror = function () {
      __xsChartVendorRequested = false;
      // Canvas fallback remains available when the chart vendor is offline.
    };
    document.head.appendChild(chartScript);
  } catch (e) {
    __xsChartVendorRequested = false;
  }
}
function renderSeedCandlesPreview(candles) {
  if (!Array.isArray(candles) || !candles.length) return;
  try {
    if (candleSeries && typeof mainSeriesPayload === 'function') {
      candleSeries.setData(mainSeriesPayload(candles));
      if (chartInstance && chartInstance.timeScale) chartInstance.timeScale().fitContent();
    } else if (typeof window !== 'undefined' && typeof window.drawCanvasFallbackChart === 'function') {
      window.drawCanvasFallbackChart(candles, null);
    }
  } catch (e) {}
}
var __xsEngineBootRequested = false;
function ensureQuantEnginesLoaded() {
  try {
    if (window.__XS_QC && window.__XS_SE) return;
    if (__xsEngineBootRequested) return;
    __xsEngineBootRequested = true;
    var bootScript = document.createElement('script');
    bootScript.type = 'module';
    bootScript.src = '/js/engine-boot.js?v=2026.88';
    bootScript.onerror = function () {
      __xsEngineBootRequested = false;
      console.error('XStarZG quant engine module failed to load');
    };
    document.head.appendChild(bootScript);
  } catch (e) {
    __xsEngineBootRequested = false;
    console.error('XStarZG quant engine bootstrap failed:', e);
  }
}
var enterWorkspaceLock = 0;
function enterWorkspace() {
  try {
    showScreen('work');
    ensureChartVendorLoaded();
    ensureQuantEnginesLoaded();
    var sk = document.getElementById('tvChartLoadingSkeleton');
    if (sk) { try { sk.style.display = 'none'; } catch (e) {} }
    updateUserUi();
    syncModeSections();
    try { renderInstrumentCatalog(); } catch (e) {}
    if (!state.manualInstrumentSelection) {
      state.candles = [];
      state.lastAnalysis = null;
      state.feedSource = '-';
    }
    try { initChart(); } catch (e) {}
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () { try { initChart(); } catch (e) {} });
    }
    if (state.manualInstrumentSelection) {
      try { connectRealtimeStream(); } catch (e) {}
    }
  } catch (e) { console.error('enterWorkspace error:', e); }
}
try { if (typeof window !== 'undefined') { window.showScreen = showScreen; window.enterWorkspace = enterWorkspace; } } catch (e) {}

/* ==================== 10. VIP PAYMENT (ON-CHAIN BSC VERIFY) ==================== */
/* v2026.66: verifikasi pembayaran DIPINDAH penuh ke server (/api/billing/verify-bsc).
   Versi lama memverifikasi sendiri via RPC publik lalu MENULIS SENDIRI tier VIP di
   localStorage — siapa pun bisa mengaktifkan VIP tanpa membayar. Sekarang server yang
   memeriksa receipt on-chain, menolak replay txHash, dan menandatangani entitlement. */
function serverRegister(email, name) {
  return fetch('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, name: name })
  }).then(function (r) { return r.json(); });
}
// Pastikan akun punya JWT server (sesi publik diterbitkan /api/auth/register).
function ensureAuthToken() {
  if (state.user && state.user.ownerToken) return Promise.resolve(state.user.ownerToken);
  if (state.user && state.user.authToken) return Promise.resolve(state.user.authToken);
  var storedJwt = '';
  try { storedJwt = localStorage.getItem('xstarzg_jwt') || ''; } catch (e) {}
  if (storedJwt) return Promise.resolve(storedJwt);
  if (!state.user || !state.user.email || /@xstarzg\.local$/.test(state.user.email)) return Promise.reject(new Error('Silakan login terlebih dahulu.'));
  return serverRegister(state.user.email, state.user.name).then(function (d) {
    if (!d || !d.ok || !d.token) throw new Error((d && d.error) || 'Gagal otentikasi sesi');
    state.user.authToken = d.token;
    if (d.user && d.user.tier === 'VIP' && d.user.vipUntil) {
      state.user.tier = 'VIP';
      state.user.vipUntil = d.user.vipUntil;
    } else if (d.user && d.user.tier === 'FREE' && state.user.tier === 'VIP') {
      // Server (D1) menyatakan entitlement sudah habis -> turunkan secara jujur.
      state.user.tier = 'FREE';
      state.user.vipUntil = null;
    }
    saveSession();
    return d.token;
  });
}
// Verifikasi on-chain DI SERVER + auto-approve entitlement bertanda tangan.
// Jika JWT kedaluwarsa (401), daftarkan ulang sesi lalu coba SEKALI lagi.
function serverVerifyBscPayment(txHash) {
  var callVerify = function (token) {
    return fetch('/api/billing/verify-bsc', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ txHash: txHash })
    }).then(function (r) { return r.json().then(function (d) { return { status: r.status, d: d }; }); });
  };
  return ensureAuthToken().then(callVerify).then(function (res) {
    if (res && res.status === 401 && state.user) {
      state.user.authToken = null;
      return ensureAuthToken().then(callVerify);
    }
    return res;
  }).then(function (res) {
    var d = (res && res.d) || {};
    if (d && d.ok) return { verified: true, vipUntil: Number(d.vipUntil) || 0, token: d.token || null };
    return { verified: false, error: (d && d.error) || T('ui.eVipNotFound', 'TxHash belum ditemukan. Pastikan transfer $29 USDT (BEP-20) sudah terkonfirmasi.') };
  });
}
// v2026.66: hidrasi modal pembayaran dari faktur SERVER (/api/billing/invoice) —
// nominal, wallet resmi, dan ID faktur satu sumber kebenaran. Markup hardcoded
// hanya fallback bila fetch gagal (mis. fungsi Cloudflare belum aktif di dev).
function hydrateVipInvoice() {
  try {
    if (typeof fetch !== 'function') return;
    fetch('/api/billing/invoice').then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok || !d.invoice) return;
      var w = $id('vipWalletAddr'); if (w && d.invoice.wallet) { w.textContent = d.invoice.wallet; VIP_WALLET = d.invoice.wallet; }
      var p = $id('vipPriceLabel'); if (p && d.invoice.amount) { p.textContent = '$' + Number(d.invoice.amount).toFixed(2) + ' USDT'; VIP_PRICE = Number(d.invoice.amount) || VIP_PRICE; }
      var inv = $id('vipInvoiceId'); if (inv) inv.textContent = d.invoice.id || '';
    }).catch(function () {});
  } catch (e) {}
}
function bindVipFlow() {
  var pm = $id('paymentModal');
  var open = function (reasonText) {
    if (reasonText) { var r = $id('vipModalReasonText'); if (r) r.textContent = reasonText; }
    if (pm) pm.classList.remove('hidden');
    hydrateVipInvoice();
  };
  var bind = function (id, fn) { var el = $id(id); if (el) el.addEventListener('click', fn); };
  bind('btnOpenVipModal', function () { open(); });
  bind('btnOpenVipFromMenu', function () {
    var dd = $id('userProfileDropdown'); if (dd) dd.classList.add('hidden');
    open();
  });
  bind('btnCloseVipModal', function () { if (pm) pm.classList.add('hidden'); });
  bind('btnCopyWallet', function () {
    var btn = $id('btnCopyWallet');
    var done = function () { if (btn) { btn.textContent = T('ui.eCopied', '✅ Tersalin!'); setTimeout(function () { btn.textContent = T('ui.eCopy', '📋 Salin'); }, 1800); } };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(VIP_WALLET).then(done).catch(done);
    } else done();
  });
  bind('btnVerifyTxHash', function () {
    var inp = $id('inpTxHash');
    var fb = $id('vipVerifyFeedback');
    var btn = $id('btnVerifyTxHash');
    var tx = (inp && inp.value || '').trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(tx)) {
      if (fb) { fb.style.color = '#fda4af'; fb.textContent = T('ui.eVipTxInvalid', '⚠️ Format TxHash tidak valid — harus diawali 0x dan 64 karakter hex.'); }
      return;
    }
    // Lisensi diikat ke akun nyata — Mode Tamu harus login dulu (bukan placeholder lokal).
    if (!state.user || !state.user.email || state.user.tier === 'GUEST' || /@xstarzg\.local$/.test(state.user.email)) {
      if (fb) { fb.style.color = '#fda4af'; fb.textContent = T('ui.eVipNeedLogin', '⚠️ Masuk dengan email Google dulu — lisensi VIP diikat ke akun Anda.'); }
      var gm = $id('googleAuthModal'); if (gm) gm.classList.remove('hidden');
      return;
    }
    if (fb) { fb.style.color = '#94a3b8'; fb.textContent = T('ui.eVipVerifying', '⏳ Memverifikasi pembayaran on-chain di jaringan BNB Smart Chain (BEP-20)…'); }
    if (btn) btn.disabled = true;
    serverVerifyBscPayment(tx).then(function (res) {
      if (btn) btn.disabled = false;
      if (res && res.verified) {
        if (fb) { fb.style.color = '#10b981'; fb.textContent = fillTpl(T('ui.eVipSuccess', '✅ Pembayaran ${amt} USDT TERVERIFIKASI ON-CHAIN! Lisensi VIP 30 hari aktif.'), { amt: VIP_PRICE.toFixed(2) }); }
        // Entitlement BERASAL DARI SERVER: tier, vipUntil, dan token bertanda tangan.
        state.user.tier = 'VIP';
        state.user.vipUntil = res.vipUntil || (Date.now() + 30 * 86400000);
        if (res.token) state.user.authToken = res.token;
        saveSession(); updateUserUi();
        setTimeout(function () { if (pm) pm.classList.add('hidden'); }, 2200);
      } else if (fb) {
        fb.style.color = '#fda4af';
        fb.textContent = 'ℹ️ ' + ((res && res.error) || T('ui.eVipNotFound', 'TxHash belum ditemukan. Pastikan transfer $29 USDT (BEP-20) sudah terkonfirmasi.'));
      }
    }).catch(function () {
      if (btn) btn.disabled = false;
      if (fb) { fb.style.color = '#fda4af'; fb.textContent = 'ℹ️ ' + T('ui.eVipServerFail', 'Server verifikasi tidak merespons. Coba lagi sesaat.'); }
    });
  });
  bind('btnRenewVipFromBanner', function () {
    open('Perpanjang masa aktif lisensi VIP Anda agar akses 700+ instrumen tidak terputus.');
  });
  var osm = $id('ownerSubscribersModal');
  bind('btnOpenOwnerSubscribers', function () {
    var dd = $id('userProfileDropdown'); if (dd) dd.classList.add('hidden');
    if (osm) osm.classList.remove('hidden');
    fetchOwnerSubscribers();
  });
  bind('btnCloseOwnerSubscribers', function () {
    if (osm) osm.classList.add('hidden');
  });
  bind('btnRefreshOwnerSubs', function () {
    fetchOwnerSubscribers();
  });
}

/* ==================== 11. BINDING SEMUA TOMBOL & ALUR ==================== */
function bindUiEvents() {
  var bind = function (id, fn) {
    var el = $id(id);
    if (el) {
      el.addEventListener('click', function (e) {
        try { fn(e); } catch (err) { console.error('Click error on ' + id + ':', err); }
      });
    }
  };
  /* ---- Landing & Login gate ---- */
  bind('btnNavLoginGate', function () {
    if (state.user && state.user.tier && state.user.tier !== 'GUEST') enterWorkspace(); else showScreen('gate');
  });
  bind('btnHeroLoginGate', function () {
    if (state.user && state.user.tier && state.user.tier !== 'GUEST') enterWorkspace(); else showScreen('gate');
  });
  bind('btnHeroPreview', function () {
    state.user = { email: 'guest@xstarzg.local', name: 'Mode Tamu', tier: 'GUEST' };
    saveSession();
    enterWorkspace();
  });
  bind('btnBackToLanding', function () { showScreen('front'); });
  bind('btnBrandLogoHome', function () { showScreen('front'); });
  bind('btnTriggerGooglePopup', function () {
    var gm = $id('googleAuthModal');
    if (gm) {
      gm.classList.remove('hidden');
      var inp = $id('googleEmailInput');
      if (inp) setTimeout(function () { try { inp.focus(); } catch (e) {} }, 80);
    }
  });
  bind('btnInstantPreview', function () {
    state.user = { email: 'guest@xstarzg.local', name: 'Mode Tamu', tier: 'GUEST' };
    saveSession();
    enterWorkspace();
  });
  bind('btnGateOwnerDirect', function () {
    var gm = $id('googleAuthModal');
    if (gm) {
      gm.classList.remove('hidden');
      var blk = $id('ownerLoginBlock');
      if (blk) blk.classList.remove('hidden');
      var einp = $id('ownerEmailInput');
      var cinp = $id('ownerCodeInput');
      if (einp && !einp.value) einp.value = 'sevenfoldarmy2822@gmail.com';
      if (cinp) setTimeout(function () { try { cinp.focus(); } catch (e) {} }, 80);
    }
  });
  var closeGoogle = function () { var gm = $id('googleAuthModal'); if (gm) gm.classList.add('hidden'); };
  bind('btnCloseGoogleModal', closeGoogle);
  bind('btnCancelGoogleModal', closeGoogle);
  bind('btnSubmitGoogleEmail', function () {
    var emailEl = $id('googleEmailInput');
    var nameEl = $id('googleNameInput');
    var email = (emailEl && emailEl.value || '').trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
      if (emailEl) { emailEl.style.borderColor = '#f43f5e'; emailEl.focus(); }
      setTxt('googleAuthError', T('ui.gErrInvalid', 'Masukkan alamat Google yang valid (cth: nama@gmail.com)'));
      return;
    }
    if (emailEl) emailEl.style.borderColor = '#334155';
    var name = (nameEl && nameEl.value || '').trim() || email.split('@')[0];
    // Semua jalur login Google publik = FREE. Tier OWNER_VIP hanya dari server:
    // jalur Owner terpisah (email + kode rahasia) divalidasi /api/auth/owner.
    var tier = 'FREE';
    var prevP = loadSession();
    var prev = prevP && prevP.user ? prevP.user : null;
    state.user = {
      email: email, name: name.charAt(0).toUpperCase() + name.slice(1), tier: tier,
      vipUntil: (prev && prev.email === email) ? prev.vipUntil : null
    };
    if (prev && prev.email === email && prev.tier === 'VIP' && prev.vipUntil && Date.now() < prev.vipUntil) {
      state.user.tier = 'VIP';
    }
    saveSession();
    closeGoogle();
    enterWorkspace();
    // v2026.66: terbitkan sesi JWT server sunyi-2 (dibutuhkan untuk verifikasi
    // pembayaran VIP yang mengikat identitas). Gagal jaringan = ditoleransi,
    // akan dicoba ulang otomatis saat user menekan tombol verifikasi.
    try { ensureAuthToken().then(function () { updateUserUi(); }).catch(function () {}); } catch (e) {}
  });
  /* ---- Jalur khusus OWNER: email + kode rahasia, divalidasi penuh di server ---- */
  bind('btnToggleOwnerLogin', function () {
    var blk = $id('ownerLoginBlock');
    if (blk) blk.classList.toggle('hidden');
  });
  bind('btnSubmitOwnerLogin', function () {
    var emailEl = $id('ownerEmailInput'), codeEl = $id('ownerCodeInput'), btn = $id('btnSubmitOwnerLogin');
    var email = (emailEl && emailEl.value || '').trim().toLowerCase();
    var code = (codeEl && codeEl.value || '').trim();
    if (!email || !code) { setTxt('ownerLoginError', T('ui.ownerNeedFields', 'Isi email pemilik dan kode akses rahasia.')); return; }
    setTxt('ownerLoginError', '');
    if (btn) { btn.disabled = true; btn.textContent = T('ui.ownerVerifying', '⏳ Memverifikasi ke server…'); }
    fetch('/api/auth/owner', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, code: code })
    }).then(function (r) { return r.json().then(function (d) { return { status: r.status, d: d }; }); })
      .then(function (res) {
        var d = res.d || {};
        if (!d.ok) {
          setTxt('ownerLoginError', d.error || T('ui.eOwnerBadCred', 'Kredensial tidak valid.'));
          if (codeEl) { codeEl.value = ''; codeEl.focus(); }
          return;
        }
        // Server mengonfirmasi identitas owner (kode rahasia benar) -> tier OWNER_VIP + token JWT
        state.user = { email: d.user.email, name: d.user.name || 'Owner', tier: 'OWNER_VIP', ownerToken: d.token };
        saveSession();
        closeGoogle();
        updateUserUi();
        enterWorkspace();
      })
      .catch(function () { setTxt('ownerLoginError', T('ui.ownerConnFail', 'Koneksi ke server otentikasi gagal. Coba lagi.')); })
      .finally(function () { if (btn) { btn.disabled = false; btn.textContent = T('ui.ownerSubmit', 'Verifikasi ke Server & Masuk sebagai Owner'); } });
  });
  /* ---- Topbar: mode & profil ---- */
  bind('btnModeTrader', function () { setMode('trader'); });
  bind('btnModeInvestor', function () { setMode('investor'); });
  bind('btnModeMeme', function () { setMode('meme'); });
  bind('btnModeNews', function () { setMode('news'); });
  bind('btnModeJournal', function () { setMode('journal'); });
  bind('btnSubFutures', function () { setSubMode('futures'); });
  bind('btnSubSpot', function () { setSubMode('spot'); });
  Array.prototype.forEach.call(document.querySelectorAll('.btn-back-to-trader'), function (b) {
    b.addEventListener('click', function () { setMode('trader'); });
  });
  var btnSess = $id('btnUserSession');
  if (btnSess) btnSess.addEventListener('click', function (e) {
    e.stopPropagation();
    var dd = $id('userProfileDropdown');
    if (dd) dd.classList.toggle('hidden');
    updateUserUi();
  });
  document.addEventListener('click', function (e) {
    var dd = $id('userProfileDropdown');
    if (dd && !dd.classList.contains('hidden') && !dd.contains(e.target) && e.target !== btnSess && !(btnSess && btnSess.contains(e.target))) {
      dd.classList.add('hidden');
    }
  });
  bind('btnBackToFrontFromMenu', function () { showScreen('front'); });
  var doLogout = function () {
    state.user = null;
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    updateUserUi();
    showScreen('front');
  };
  bind('btnLogout', doLogout);
  bind('btnDirectLogout', doLogout);
  /* ---- Kontrol instrumen ---- */
  var catSel = $id('selCategory');
  if (catSel) catSel.addEventListener('change', function () {
    renderInstrumentCatalog();
    if (catSel.value === 'CRYPTO') {
      if (QC && QC.registerDynamicInstrument) lazyLoadCryptoPairs();
      else if (!window.__xsCryptoCatalogWaiter) {
        window.__xsCryptoCatalogWaiter = true;
        window.addEventListener('xs-engine-booted', function () {
          if (QC && QC.registerDynamicInstrument && catSel.value === 'CRYPTO') lazyLoadCryptoPairs();
        }, { once: true });
      }
    }
  });
  var searchInp = $id('inpSearchAsset');
  if (searchInp) {
    searchInp.addEventListener('input', function () { renderInstrumentCatalog(searchInp.value); });
    searchInp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = ($id('selInstrument') || {}).querySelector ? $id('selInstrument').querySelector('option') : null;
        if (first && first.value) selectSymbol(first.value);
      }
    });
  }
  var instSel = $id('selInstrument');
  if (instSel) instSel.addEventListener('change', function () { if (instSel.value) selectSymbol(instSel.value); });
  /* ---- Timeframe bar ---- */
  var tfBar = $id('timeframeBar');
  if (tfBar) {
    Array.prototype.forEach.call(tfBar.querySelectorAll('.tf-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var tf = btn.getAttribute('data-tf');
        if (!tf || tf === state.tf) return;
        Array.prototype.forEach.call(tfBar.querySelectorAll('.tf-btn'), function (b) { b.classList.toggle('active', b === btn); });
        state.tf = tf; state.timeframe = tf;
        // Keep the last valid chart visible while the new timeframe is loading.
        // Clearing candles here forced runFullAnalysis to synchronously seed and
        // quantify 220 synthetic bars before fetching the real timeframe.
        state.bestTfBoard = null;
        saveSession();
        setTxt('lblEngineStatus', '⏳ MEMUAT ' + tf + ' — mengambil candle broker…');
        try { startCandleCountdown(); } catch (e) {}
        if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true);
      });
    });
  }
  /* ---- Pemilih tipe chart (Candlestick/Bar/Line/Area) ---- */
  var ctBar = $id('chartTypeBar');
  if (ctBar) {
    Array.prototype.forEach.call(ctBar.querySelectorAll('.chart-type-btn'), function (btn) {
      btn.addEventListener('click', function () { applyChartType(btn.getAttribute('data-ctype')); });
    });
  }
  /* ---- Tab horizon radar (Scalping / Intraday / Swing) ---- */
  var hzBar = $id('radarHorizonBar');
  if (hzBar) {
    Array.prototype.forEach.call(hzBar.querySelectorAll('.hz-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var hz = btn.getAttribute('data-hz');
        if (!hz || hz === state.radarHorizon) return;
        state.radarHorizon = hz;
        syncHorizonTabs();
        saveSession();
        renderOpportunityRadar(true);
      });
    });
  }
  /* ---- Tab filter & sort DEX Meme Radar ---- */
  var mcBar = $id('memeChainBar');
  if (mcBar) {
    Array.prototype.forEach.call(mcBar.querySelectorAll('.hz-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var mc = btn.getAttribute('data-mc') || 'all';
        if (mc === activeMemeChain) return;
        activeMemeChain = mc;
        Array.prototype.forEach.call(mcBar.querySelectorAll('.hz-btn'), function (b) {
          b.classList.toggle('active', (b.getAttribute('data-mc') || 'all') === activeMemeChain);
        });
        renderMemePicks(true);
      });
    });
  }
  var msBar = $id('memeSortBar');
  if (msBar) {
    Array.prototype.forEach.call(msBar.querySelectorAll('.hz-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var ms = btn.getAttribute('data-ms') || 'momentum';
        if (ms === activeMemeSort) return;
        activeMemeSort = ms;
        Array.prototype.forEach.call(msBar.querySelectorAll('.hz-btn'), function (b) {
          b.classList.toggle('active', (b.getAttribute('data-ms') || 'momentum') === activeMemeSort);
        });
        renderMemePicks(true);
      });
    });
  }
  /* ---- View switches & selector DEX Meme Workspace ---- */
  bind('btnMemeViewCandles', function () { switchMemeChartView('candles'); });
  bind('btnMemeViewDex', function () { switchMemeChartView('dex'); });
  var selM = $id('selMemeInstrument');
  if (selM) {
    selM.addEventListener('change', function () {
      var sym = selM.value;
      var pool = (memeScanPool && memeScanPool.length) ? memeScanPool : DEFAULT_MEME_CATALOG;
      var found = pool.find(function (x) { return x.symbol === sym; });
      if (found) selectMemeToken(found);
    });
  }
  var mtfBar = $id('memeTfBar');
  if (mtfBar) {
    Array.prototype.forEach.call(mtfBar.querySelectorAll('.tf-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var tf = btn.getAttribute('data-mtf') || 'M5';
        activeMemeTf = tf;
        Array.prototype.forEach.call(mtfBar.querySelectorAll('.tf-btn'), function (b) {
          b.classList.toggle('active', (b.getAttribute('data-mtf') || 'M5') === tf);
        });
        if (activeMemeToken) {
          activeMemeCandles = generateMemeCandles(activeMemeToken, activeMemeTf);
          drawMemeCandleChart(activeMemeToken, activeMemeCandles);
        }
      });
    });
  }
  window.addEventListener('resize', function () {
    if (state.mode === 'meme' && activeMemeToken && activeMemeChartView === 'candles') {
      drawMemeCandleChart(activeMemeToken, activeMemeCandles);
    }
  });
  /* ---- Overlay toggles & recalc ---- */
  ['chkEMA', 'chkVWAP', 'chkSMC', 'chkSniper'].forEach(function (id) {
    var el = $id(id);
    if (el) el.addEventListener('change', function () {
      syncIndicatorOverlays(state.lastAnalysis);
      drawChartLevels(state.lastAnalysis);
      // v2026.63: canvas fallback juga ikut menggambar ulang overlay/level
      try { if (typeof window.drawCanvasFallbackChart === 'function') window.drawCanvasFallbackChart(state.candles, state.lastAnalysis); } catch (e) {}
    });
  });
  bind('btnRunEngine', function () { if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true); });
  /* ---- Smart Signal & Price Alarm ---- */
  bind('btnToggleSignalAlarm', toggleSignalAlarm);
  bind('btnCloseAlarmToast', function () {
    var t = $id('signalAlarmToast'); if (t) t.classList.add('hidden');
  });
  bind('btnTestAlarmSound', function () {
    playAlertChime();
    showAlarmToast('🔊 TES SUARA ALARM', 'Denting lonceng institusional aktif & jernih. Begitu sinyal [' + (alarmState.symbol || state.symbol || 'GRAM/USDT') + '] terbuka, suara ini akan berbunyi.');
  });
  /* ---- Signal Journal search & SL+ alerts ---- */
  var inpJnlSearch = $id('inpJournalSearch');
  if (inpJnlSearch) {
    inpJnlSearch.addEventListener('input', function () { renderSignalJournal(); });
    inpJnlSearch.addEventListener('change', function () { renderSignalJournal(); });
  }
  bind('btnJournalClearSearch', function () {
    if (inpJnlSearch) {
      inpJnlSearch.value = '';
      inpJnlSearch.focus();
    }
    renderSignalJournal();
  });
  bind('btnClearAllJournalHistory', function () {
    var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
    var msg = isEn
      ? 'Clear the shared cloud journal and all local Trader, Investor and DEX history? This cannot be undone.'
      : 'Kosongkan jurnal cloud bersama dan seluruh riwayat lokal Trader, Investor, serta DEX? Tindakan ini tidak dapat dibatalkan.';
    if (!confirm(msg)) return;
    ensureAuthToken().then(function (token) {
      return fetch('/api/market/journal-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'clear_all' })
      }).then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, data: d }; });
      });
    }).then(function (result) {
      if (!result.ok || !result.data || !result.data.ok) {
        throw new Error((result.data && result.data.error) || 'Server menolak reset jurnal.');
      }
      clearLocalJournalStores(result.data.resetAt || Date.now());
      renderSignalJournal();
      alert(isEn
        ? 'The shared cloud journal and local history have been cleared.'
        : 'Jurnal cloud bersama dan seluruh riwayat lokal berhasil dikosongkan.');
    }).catch(function (err) {
      alert((isEn ? 'Journal reset failed: ' : 'Reset jurnal gagal: ') +
        (err && err.message ? err.message : 'Periksa sesi owner dan koneksi server.'));
    });
  });
  bind('btnToggleSlPlusNotify', function () {
    toggleSlPlusNotification();
  });
  loadPersistedSlPlusNotify();
  updateSlPlusNotifyUi();

  /* ---- 3-Segment Journal Tabs & Actions ---- */
  bind('btnTabJnlTrader', function () {
    activeJournalTab = 'trader';
    renderSignalJournal();
  });
  bind('btnTabJnlInvestor', function () {
    activeJournalTab = 'investor';
    renderSignalJournal();
  });
  bind('btnTabJnlMeme', function () {
    activeJournalTab = 'meme';
    renderSignalJournal();
  });

  // Quick-Add buttons from workspaces
  bind('btnQuickAddInvestorJnl', function () {
    var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
    var sym = state.symbol || 'BTC/USDT';
    var price = (state.candles && state.candles.length) ? state.candles[state.candles.length - 1].close : (state.livePrice || 100);
    var an = state.lastAnalysis;
    var lv = (an && an.levels) || {};
    var it = {
      id: 'inv_' + Date.now(),
      symbol: sym,
      name: (an && an.name) || sym,
      assetClass: (an && an.assetClass) || 'crypto',
      entryPrice: price,
      currentPrice: price,
      dcaZone1: num(lv.dcaZone1, price),
      dcaZone2: num(lv.dcaZone2, price * 0.95),
      dcaZone3: num(lv.dcaZone3, price * 0.90),
      target1: num(lv.invTarget1, price * 1.25),
      target2: num(lv.invTarget2, price * 1.50),
      valuationStatus: (an && an.direction === 'LONG' ? (isEn ? 'UNDERVALUED (DISCOUNT)' : 'UNDERVALUE (DISKON)') : 'FAIR VALUE'),
      notes: isEn ? 'Spot accumulation recorded directly from Investor panel.' : 'Akumulasi spot dicatat langsung dari panel Investor.',
      at: Date.now(),
      status: 'ACTIVE'
    };
    var all = investorJournalStore();
    all.unshift(it);
    saveInvestorJournalStore(all);
    activeJournalTab = 'investor';
    renderSignalJournal();
    alert(isEn
      ? ('✅ Accumulation for ' + sym + ' successfully saved to Investor Journal!\n\nBuy Price: ' + formatPrice(price, sym))
      : ('✅ Akumulasi ' + sym + ' berhasil dicatat ke Jurnal Investor!\n\nHarga Beli: ' + formatPrice(price, sym)));
  });

  bind('btnQuickAddMemeJnl', function () {
    var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
    var token = activeMemeToken;
    if (token) {
      var it = {
        id: 'meme_' + Date.now(),
        symbol: token.symbol,
        name: token.name,
        chain: token.chain,
        chainLabel: token.chainLabel || token.chain.toUpperCase(),
        address: token.address,
        buyPrice: token.basePrice,
        currentPrice: token.basePrice,
        targetX: 2.0,
        tp1Secured: false,
        notes: isEn ? ('Recorded directly from live inspection DEX Workspace (' + (token.chainLabel || '') + ').') : ('Dicatat langsung dari live inspection DEX Workspace (' + (token.chainLabel || '') + ').'),
        at: Date.now(),
        status: 'ACTIVE'
      };
      var all = memeJournalStore();
      all.unshift(it);
      saveMemeJournalStore(all);
      activeJournalTab = 'meme';
      renderSignalJournal();
      alert(isEn
        ? ('✅ Coin ' + token.symbol + ' successfully saved to DEX Meme Journal!\n\nDEX Buy Price: $' + token.basePrice)
        : ('✅ Koin ' + token.symbol + ' berhasil dicatat ke Jurnal DEX Micin!\n\nHarga Beli DEX: $' + token.basePrice));
    }
  });

  // Modals: Add Investor Record
  var modalAddInv = $id('addInvestorModal');
  bind('btnOpenAddInvestorModal', function () {
    if (modalAddInv) {
      var inpSym = $id('inpAddInvSymbol');
      var inpEnt = $id('inpAddInvEntry');
      var inpT1 = $id('inpAddInvTarget1');
      if (inpSym) inpSym.value = state.symbol || '';
      if (inpEnt) {
        var p = (state.candles && state.candles.length) ? state.candles[state.candles.length - 1].close : (state.livePrice || '');
        inpEnt.value = p || '';
      }
      if (inpT1) inpT1.value = '';
      modalAddInv.classList.remove('hidden');
    }
  });
  bind('btnCloseAddInvestorModal', function () { if (modalAddInv) modalAddInv.classList.add('hidden'); });
  bind('btnCancelAddInvestorModal', function () { if (modalAddInv) modalAddInv.classList.add('hidden'); });
  bind('btnSubmitAddInvestor', function () {
    var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
    var inpSym = $id('inpAddInvSymbol');
    var inpEnt = $id('inpAddInvEntry');
    var inpT1 = $id('inpAddInvTarget1');
    var inpNotes = $id('inpAddInvNotes');
    var sym = inpSym ? inpSym.value.trim().toUpperCase() : '';
    var ent = inpEnt ? parseFloat(inpEnt.value) : 0;
    if (!sym || !ent || ent <= 0) {
      alert(isEn ? '⚠️ Please enter a valid Asset Symbol and Buy Price!' : '⚠️ Mohon isi Simbol Aset dan Harga Beli yang valid!');
      return;
    }
    var t1 = inpT1 && parseFloat(inpT1.value) > 0 ? parseFloat(inpT1.value) : (ent * 1.3);
    var notes = inpNotes ? inpNotes.value.trim() : '';
    var it = {
      id: 'inv_' + Date.now(),
      symbol: sym,
      name: sym,
      assetClass: sym.indexOf('/') > -1 ? 'crypto' : 'stocks',
      entryPrice: ent,
      currentPrice: ent,
      target1: t1,
      target2: ent * 1.6,
      valuationStatus: isEn ? 'UNDERVALUED (DISCOUNT)' : 'UNDERVALUE (DISKON)',
      notes: notes || (isEn ? 'Manually recorded investment.' : 'Investasi dicatat secara manual.'),
      at: Date.now(),
      status: 'ACTIVE'
    };
    var all = investorJournalStore();
    all.unshift(it);
    saveInvestorJournalStore(all);
    if (modalAddInv) modalAddInv.classList.add('hidden');
    activeJournalTab = 'investor';
    renderSignalJournal();
  });

  // Modals: Add Meme Record
  var modalAddMeme = $id('addMemeModal');
  bind('btnOpenAddMemeModal', function () {
    if (modalAddMeme) {
      var inpSym = $id('inpAddMemeSymbol');
      var inpP = $id('inpAddMemeBuyPrice');
      if (inpSym) inpSym.value = (activeMemeToken && activeMemeToken.symbol) || '';
      if (inpP) inpP.value = (activeMemeToken && activeMemeToken.basePrice) || '';
      modalAddMeme.classList.remove('hidden');
    }
  });
  bind('btnCloseAddMemeModal', function () { if (modalAddMeme) modalAddMeme.classList.add('hidden'); });
  bind('btnCancelAddMemeModal', function () { if (modalAddMeme) modalAddMeme.classList.add('hidden'); });
  bind('btnSubmitAddMeme', function () {
    var isEn = (window.XSI18N && typeof window.XSI18N.getLanguage === 'function' && window.XSI18N.getLanguage() !== 'id');
    var inpSym = $id('inpAddMemeSymbol');
    var selChain = $id('selAddMemeChain');
    var inpP = $id('inpAddMemeBuyPrice');
    var inpX = $id('inpAddMemeTargetX');
    var inpCA = $id('inpAddMemeCA');
    var sym = inpSym ? inpSym.value.trim().toUpperCase() : '';
    var p = inpP ? parseFloat(inpP.value) : 0;
    if (!sym || !p || p <= 0) {
      alert(isEn ? '⚠️ Please enter a valid Coin Symbol and Buy Price!' : '⚠️ Mohon isi Simbol Koin dan Harga Beli yang valid!');
      return;
    }
    var chain = selChain ? selChain.value : 'solana';
    var chainLabel = chain === 'solana' ? '🟣 Solana' : (chain === 'base' ? '🔵 Base' : (chain === 'bsc' ? '🟡 BSC' : '⚪ Ethereum'));
    var tx = inpX && parseFloat(inpX.value) > 0 ? parseFloat(inpX.value) : 2.0;
    var ca = inpCA ? inpCA.value.trim() : '';
    var it = {
      id: 'meme_' + Date.now(),
      symbol: sym,
      name: sym,
      chain: chain,
      chainLabel: chainLabel,
      address: ca || (sym.toLowerCase() + '_pool'),
      buyPrice: p,
      currentPrice: p,
      targetX: tx,
      tp1Secured: false,
      notes: isEn ? 'DEX Gem recorded manually to profit radar.' : 'Koin micin dicatat manual ke radar keuntungan.',
      at: Date.now(),
      status: 'ACTIVE'
    };
    var all = memeJournalStore();
    all.unshift(it);
    saveMemeJournalStore(all);
    if (modalAddMeme) modalAddMeme.classList.add('hidden');
    activeJournalTab = 'meme';
    renderSignalJournal();
  });

  /* ---- Telegram VIP Gating & 1-Click Access Flow ---- */
  var modalTgVip = $id('telegramVipModal');
  var paywallBlock = $id('tgVipPaywallBlock');
  var activeBlock = $id('tgVipActiveBlock');
  var linkStart = $id('linkTgVipStart');
  var badgeUser = $id('lblTgVipUserBadge');
  var btnUpgradeTg = $id('btnUpgradeToVipForTg');
  var btnCloseTgVip = $id('btnCloseTgVipModal');
  var inpTgUid = $id('inpTgVipChatId');
  var btnSaveTgUid = $id('btnSaveTgVipChatId');
  var msgTgUidStatus = $id('msgTgVipStatus');
  var boxOwnerBot = $id('tgOwnerBotConfigBox');
  var inpOwnerBotUser = $id('inpTgOfficialBotUsername');
  var btnSaveOwnerBotUser = $id('btnSaveOfficialBotUsername');
  var msgOwnerBotStatus = $id('msgTgOfficialBotStatus');

  var currentDeepLinkUrl = null;

  function openTelegramVipModal() {
    var curUser = state.user;
    var isOwner = curUser && (curUser.tier === 'OWNER_VIP' || (curUser.email && (curUser.email === 'sevenfoldarmy2822@gmail.com' || curUser.email === 'gilfanputra@gmail.com')));
    var isAffiliate = curUser && (curUser.isAffiliate || curUser.role === 'affiliate');
    var isVip = isOwner || isAffiliate || (curUser && curUser.tier === 'VIP' && (!curUser.vipUntil || curUser.vipUntil > Date.now()));

    if (msgTgUidStatus) msgTgUidStatus.textContent = '';
    if (msgOwnerBotStatus) msgOwnerBotStatus.textContent = '';
    currentDeepLinkUrl = null;

    if (!isVip) {
      // User FREE / GUEST -> Tampilkan Paywall Gating dengan tombol upgrade VIP!
      if (paywallBlock) paywallBlock.classList.remove('hidden');
      if (activeBlock) activeBlock.classList.add('hidden');
    } else {
      // User VIP / Owner / Affiliate -> Tampilkan Aktivasi 1-Klik!
      if (paywallBlock) paywallBlock.classList.add('hidden');
      if (activeBlock) activeBlock.classList.remove('hidden');

      if (badgeUser) {
        badgeUser.textContent = isOwner ? '👑 OWNER / DEVELOPER' : (isAffiliate ? '🤝 AFFILIATE PARTNER' : '💎 VIP PRO MEMBER');
      }

      if (boxOwnerBot) {
        boxOwnerBot.classList.toggle('hidden', !isOwner);
      }

      // Ambil deep-link aktivasi terenkripsi dari server
      if (linkStart) {
        linkStart.style.opacity = '0.7';
      }

      ensureAuthToken().then(function (token) {
        if (!token) return;
        return fetch('/api/notify/telegram-link', {
          headers: { 'Authorization': 'Bearer ' + token }
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (linkStart) linkStart.style.opacity = '1';
          if (d && d.ok) {
            if (d.deepLink) {
              currentDeepLinkUrl = d.deepLink;
              if (linkStart) linkStart.href = d.deepLink;
            }
            if (d.botUsername && inpOwnerBotUser && !inpOwnerBotUser.value) {
              inpOwnerBotUser.value = '@' + d.botUsername;
            }
            if (d.linkedChatId) {
              telegramConfig.chatId = String(d.linkedChatId).trim();
              savePersistedTelegramConfig();
              updateTelegramUi();
              if (inpTgUid) inpTgUid.value = d.linkedChatId;
              if (msgTgUidStatus) {
                msgTgUidStatus.style.color = '#10b981';
                msgTgUidStatus.textContent = '✅ HP Anda sudah terhubung (ID: ' + d.linkedChatId + ')';
              }
            }
          }
        });
      }).catch(function () {
        if (linkStart) linkStart.style.opacity = '1';
      });
    }

    if (modalTgVip) modalTgVip.classList.remove('hidden');
  }

  // Intersep klik linkStart jika bot belum disetel
  if (linkStart) {
    linkStart.addEventListener('click', function (e) {
      if (!currentDeepLinkUrl) {
        e.preventDefault();
        var curUser = state.user;
        var isOwner = curUser && (curUser.tier === 'OWNER_VIP' || (curUser.email && (curUser.email === 'sevenfoldarmy2822@gmail.com' || curUser.email === 'gilfanputra@gmail.com')));
        if (isOwner) {
          if (msgOwnerBotStatus) {
            msgOwnerBotStatus.style.color = '#f59e0b';
            msgOwnerBotStatus.textContent = '⚠️ Masukkan username bot Telegram Anda di atas sekali saja, lalu klik Simpan!';
          }
          if (inpOwnerBotUser) inpOwnerBotUser.focus();
        } else {
          if (msgTgUidStatus) {
            msgTgUidStatus.style.color = '#38bdf8';
            msgTgUidStatus.textContent = '💡 Hubungkan Chat ID Telegram Anda pada kolom di bawah untuk langsung mengaktifkan notifikasi!';
          }
          if (inpTgUid) inpTgUid.focus();
        }
      }
    });
  }

  // Handler simpan username bot resmi khusus Owner
  if (btnSaveOwnerBotUser) {
    btnSaveOwnerBotUser.addEventListener('click', function () {
      var botVal = inpOwnerBotUser ? inpOwnerBotUser.value.trim().replace(/^@/, '') : '';
      if (!botVal) {
        if (msgOwnerBotStatus) {
          msgOwnerBotStatus.style.color = '#f43f5e';
          msgOwnerBotStatus.textContent = '⚠️ Masukkan username bot Anda dari @BotFather!';
        }
        return;
      }
      if (msgOwnerBotStatus) {
        msgOwnerBotStatus.style.color = '#38bdf8';
        msgOwnerBotStatus.textContent = '⏳ Menyimpan pengaturan bot resmi...';
      }
      btnSaveOwnerBotUser.disabled = true;

      ensureAuthToken().then(function (token) {
        return fetch('/api/notify/telegram-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ action: 'set_bot_config', botUsername: botVal })
        }).then(function (r) { return r.json(); });
      }).then(function (d) {
        if (d && d.ok) {
          if (msgOwnerBotStatus) {
            msgOwnerBotStatus.style.color = '#10b981';
            msgOwnerBotStatus.textContent = '✅ Berhasil! Bot @' + botVal + ' sekarang aktif untuk semua pengguna.';
          }
          // Refresh deep-link seketika
          openTelegramVipModal();
        } else {
          if (msgOwnerBotStatus) {
            msgOwnerBotStatus.style.color = '#f43f5e';
            msgOwnerBotStatus.textContent = '❌ ' + ((d && d.error) || 'Gagal menyimpan.');
          }
        }
      }).catch(function (e) {
        if (msgOwnerBotStatus) {
          msgOwnerBotStatus.style.color = '#f43f5e';
          msgOwnerBotStatus.textContent = '❌ Error: ' + e.message;
        }
      }).finally(function () {
        btnSaveOwnerBotUser.disabled = false;
      });
    });
  }

  function closeTelegramVipModal() {
    if (modalTgVip) modalTgVip.classList.add('hidden');
  }

  bind('btnTelegramVipAccess', openTelegramVipModal);
  bind('btnTelegramVipAccessJnl', openTelegramVipModal);
  bind('btnCloseTgVipModal', closeTelegramVipModal);
  if (modalTgVip) {
    modalTgVip.addEventListener('click', function (e) {
      if (e.target === modalTgVip) closeTelegramVipModal();
    });
  }

  if (btnUpgradeTg) {
    btnUpgradeTg.addEventListener('click', function () {
      closeTelegramVipModal();
      var pm = $id('paymentModal');
      var r = $id('vipModalReasonText');
      if (r) r.textContent = 'Tingkatkan akun ke VIP Pro untuk membuka bot notifikasi Telegram 24/7 di HP serta akses tanpa batas ke seluruh 700+ instrumen.';
      if (pm) pm.classList.remove('hidden');
      try { hydrateVipInvoice(); } catch (e) {}
    });
  }

  if (btnSaveTgUid) {
    btnSaveTgUid.addEventListener('click', function () {
      var cid = inpTgUid ? inpTgUid.value.trim().replace(/^(id\s*[:=]\s*)/i, '').replace(/\s+/g, '') : '';
      if (!cid || !/^-?\d+$/.test(cid)) {
        if (msgTgUidStatus) {
          msgTgUidStatus.style.color = '#f43f5e';
          msgTgUidStatus.textContent = '⚠️ Masukkan angka Chat ID / UID yang valid dari @userinfobot!';
        }
        return;
      }
      if (msgTgUidStatus) {
        msgTgUidStatus.style.color = '#38bdf8';
        msgTgUidStatus.textContent = '⏳ Menghubungkan ID ke database VIP...';
      }
      btnSaveTgUid.disabled = true;

      ensureAuthToken().then(function (token) {
        if (!token) throw new Error('Silakan login terlebih dahulu.');
        return fetch('/api/notify/telegram-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ chatId: cid })
        }).then(function (r) {
          return r.json().then(function (d) {
            if (!r.ok || !d.ok) {
              throw new Error((d && (d.error || d.message)) || ('HTTP ' + r.status));
            }
            return d;
          });
        });
      }).then(function (d) {
        if (msgTgUidStatus) {
          msgTgUidStatus.style.color = '#10b981';
          msgTgUidStatus.textContent = '✅ Berhasil terhubung! HP Anda (' + cid + ') akan menerima sinyal 24/7.';
        }
        telegramConfig.chatId = cid;
        savePersistedTelegramConfig();
        updateTelegramUi();
      }).catch(function (e) {
        if (msgTgUidStatus) {
          msgTgUidStatus.style.color = '#f43f5e';
          msgTgUidStatus.textContent = '❌ Gagal: ' + (e.message || 'Coba lagi.');
        }
      }).finally(function () {
        btnSaveTgUid.disabled = false;
      });
    });
  }

  // Handler tombol kirim pesan tes ke HP
  var btnTestPing = $id('btnTestTgPing');
  var msgTestPing = $id('msgTgTestStatus');
  if (btnTestPing) {
    btnTestPing.addEventListener('click', function () {
      var cid = inpTgUid ? inpTgUid.value.trim().replace(/^(id\s*[:=]\s*)/i, '').replace(/\s+/g, '') : (telegramConfig.chatId || '');
      if (msgTestPing) {
        msgTestPing.style.color = '#38bdf8';
        msgTestPing.textContent = '⏳ Mengirim pesan tes ke Telegram HP Anda...';
      }
      btnTestPing.disabled = true;
      ensureAuthToken().then(function (token) {
        if (!token) throw new Error('Silakan login terlebih dahulu.');
        return fetch('/api/notify/telegram-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ action: 'test_ping', chatId: cid })
        }).then(function (r) {
          return r.json().then(function (d) {
            if (!r.ok || !d.ok) throw new Error((d && (d.error || d.message)) || 'Gagal mengirim pesan.');
            return d;
          });
        });
      }).then(function (d) {
        if (msgTestPing) {
          msgTestPing.style.color = '#10b981';
          msgTestPing.textContent = '✅ Sukses! Buka Telegram di HP Anda, pesan tes telah masuk!';
        }
        if (cid) {
          telegramConfig.chatId = cid;
          savePersistedTelegramConfig();
          updateTelegramUi();
        }
      }).catch(function (err) {
        if (msgTestPing) {
          msgTestPing.style.color = '#f43f5e';
          msgTestPing.textContent = '❌ ' + err.message;
        }
      }).finally(function () {
        btnTestPing.disabled = false;
      });
    });
  }

  /* ---- Instagram & Sosmed Feedback Modal Flow ---- */
  var modalIg = $id('instagramFeedbackModal');
  var btnCloseIg = $id('btnCloseInstagramModal');
  var btnCopyIg = $id('btnCopyIgLink');
  var toastIg = $id('copyIgSuccessToast');
  var IG_URL = 'https://www.instagram.com/xstarzganalysis?avpt=ZWF1dThxYzQwNmNj';

  function openInstagramModal() {
    if (modalIg) modalIg.classList.remove('hidden');
    if (toastIg) toastIg.textContent = '';
  }

  function closeInstagramModal() {
    if (modalIg) modalIg.classList.add('hidden');
  }

  bind('btnOpenInstagramModal', openInstagramModal);
  bind('btnOpenInstagramModalJnl', openInstagramModal);
  bind('btnOpenInstagramFromMenu', function () {
    var dd = $id('userProfileDropdown');
    if (dd) dd.classList.add('hidden');
    openInstagramModal();
  });
  bind('btnCloseInstagramModal', closeInstagramModal);

  if (modalIg) {
    modalIg.addEventListener('click', function (e) {
      if (e.target === modalIg) closeInstagramModal();
    });
  }

  function fallbackCopyIgText(text) {
    try {
      var t = document.createElement('textarea');
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      document.body.removeChild(t);
      if (toastIg) {
        toastIg.style.color = '#10b981';
        toastIg.textContent = '✅ Link Instagram @xstarzganalysis berhasil disalin!';
        setTimeout(function () { if (toastIg) toastIg.textContent = ''; }, 3500);
      }
    } catch (e) {}
  }

  if (btnCopyIg) {
    btnCopyIg.addEventListener('click', function () {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(IG_URL).then(function () {
          if (toastIg) {
            toastIg.style.color = '#10b981';
            toastIg.textContent = '✅ Link Instagram @xstarzganalysis berhasil disalin ke clipboard!';
            setTimeout(function () { if (toastIg) toastIg.textContent = ''; }, 3500);
          }
        }).catch(function () {
          fallbackCopyIgText(IG_URL);
        });
      } else {
        fallbackCopyIgText(IG_URL);
      }
    });
  }

  /* ---- Risk calc inputs ---- */
  ['inpCalcBalance', 'inpCalcRiskPct'].forEach(function (id) {
    var el = $id(id);
    if (el) el.addEventListener('input', updateRiskSizing);
  });
  bindVipFlow();
}
function setMode(mode) {
  state.mode = mode;
  syncTfBarForMode();
  var t = $id('btnModeTrader'), i = $id('btnModeInvestor'), m = $id('btnModeMeme');
  var nw = $id('btnModeNews'), jn = $id('btnModeJournal');
  if (t) t.classList.toggle('active', mode === 'trader');
  if (i) i.classList.toggle('active', mode === 'investor');
  if (m) m.classList.toggle('active', mode === 'meme');
  if (nw) nw.classList.toggle('active', mode === 'news');
  if (jn) jn.classList.toggle('active', mode === 'journal');
  var sub = $id('traderSubModeWrap');
  if (sub) sub.style.display = mode === 'trader' ? 'flex' : 'none';
  if (mode === 'investor' && state.radarHorizon === 'scalping') state.radarHorizon = 'swing';
  syncHorizonTabs();
  syncModeSections();
  stopMemeLiveTicker();
  if (mode === 'meme') renderMemeInstrumentOptions();
  else if (mode === 'news') { fetchNewsCalendar(true); renderNewsPanel(); }
  else if (mode === 'journal') { syncCloudSignalJournal(); renderSignalJournal(); }
  renderMacroMap();
  updateModeChip();
  syncTfBarForMode();
  saveSession();
}
function setSubMode(sub) {
  state.subMode = sub;
  var f = $id('btnSubFutures'), s = $id('btnSubSpot');
  if (f) f.classList.toggle('active', sub === 'futures');
  if (s) s.classList.toggle('active', sub === 'spot');
  updateModeChip();
  syncTfBarForMode();
  saveSession();
  state.bestTfBoard = null;
  if (state.lastAnalysis) {
    renderPanels(state.lastAnalysis);
    renderHeader(state.lastAnalysis);
    drawChartLevels(state.lastAnalysis);
  }
}
function selectSymbol(sym) {
  if (!sym) return;
  if (!ensureQuotaFor(sym)) {
    renderInstrumentCatalog();
    return;
  }
  if (feedReconnectTimer) { try { clearInterval(feedReconnectTimer); feedReconnectTimer = null; } catch (e) {} }
  state.manualInstrumentSelection = true;
  state.symbol = sym;
  state.candles = [];
  state.lastAnalysis = null;
  state.bestTfBoard = null;
  state.feedSource = '-';
  try { auditAndCleanseCorruptedStorage(); } catch (e) {}
  renderInstrumentCatalog();
  saveSession(); // preferensi ikut tersimpan agar refresh tidak keluar
  if (typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true);
  connectRealtimeStream();
}

/* ==================== 12. BOOTSTRAP ==================== */
/* AUTO-PILOT radar & kurasi investor: memindai ulang katalog secara mandiri setiap
   slot rotasi (5 menit) sehingga instrumen berpotensi baru muncul sendiri tanpa
   refresh manual. Repaint murah tiap 60 dtk; scan batch penuh tiap 5 menit;
   jeda otomatis saat tab tidak terlihat. */
var radarAutoLastForce = 0;
function startRadarAutoPilot() { return; }
var __xsBootCoreStarted = false;
function bootCore() {
  if (__xsBootCoreStarted) return;
  __xsBootCoreStarted = true;
  try { bindUiEvents(); } catch (e) {}
  try { loadPersistedTelegramConfig(); } catch (e) {}
  var saved = null;
  try { saved = loadSession(); } catch (e) {}
  if (saved && saved.user) {
    // FIX refresh-kickout: sesi login tersimpan -> langsung kembali ke dashboard
    // analisa dengan simbol/timeframe/mode terakhir (tanpa login ulang).
    state.user = saved.user;
    try { syncTelegramLinkStatus(); } catch (e) {}
    try { syncCloudSignalJournal(); } catch (e) {}
    try { applyWorkspacePrefs(saved); } catch (e) {}
    try { updateUserUi(); } catch (e) {}
    try { verifyOwnerSession(); } catch (e) {}
    try { verifyVipSession(); } catch (e) {}
    try { syncModeSections(); } catch (e) {}
    try { enterWorkspace(); } catch (e) {}
  } else {
    // Deteksi mode PWA / Android WebAPK: jika dibuka dari launcher / APK,
    // langsung masuk ke workspace sebagai Tamu tanpa tertahan di layar depan (splash hang fix)
    var isPwaLaunch = false;
    try {
      isPwaLaunch = !!window.__isPwaLaunch ||
        (window.location && window.location.search && window.location.search.indexOf('pwa=1') > -1) ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    } catch (ePwaLaunch) {}

    if (isPwaLaunch) {
      state.user = { email: 'pwa-guest@xstarzg.local', name: 'Mode Tamu PWA', tier: 'GUEST' };
      try { saveSession(); } catch (e) {}
      try { updateUserUi(); } catch (e) {}
      try { syncModeSections(); } catch (e) {}
      try { enterWorkspace(); } catch (e) {}
    } else if (state.user) {
      try { renderInstrumentCatalog(); } catch (e) {}
      try { updateUserUi(); } catch (e) {}
      try { syncModeSections(); } catch (e) {}
      try { enterWorkspace(); } catch (e) {}
    } else {
      try { updateUserUi(); } catch (e) {}
      try { showScreen('front'); } catch (e) {}
    }
  }
  // Muat mesin quant bersama (hasil penyempurnaan sesi sebelumnya)
  // Engine kuantitatif dimuat lewat berkas modul eksternal /js/engine-boot.js
  // (CSP ketat tanpa 'unsafe-eval'): modul menaruh hasil di window.__XS_QC/__XS_SE
  // lalu memicu event 'xs-engine-booted'.
  var applyEngines = function () {
    var qc = window.__XS_QC || null, se = window.__XS_SE || null;
    if (!qc && !se) return;
    if (qc) QC = qc;
    if (se) SE = se;
    renderInstrumentCatalog();
    // Expanded crypto catalog is opt-in: load it only when the user selects CRYPTO.
    // Setelah restore-refresh engine mungkin belum siap saat analisa awal jalan
    // (fallback ringan) -> jalankan ulang satu kali agar 22 pilar penuh tampil.
    if (state.user && state.candles && state.candles.length && typeof window.runFullAnalysis === 'function') {
      window.runFullAnalysis(true);
    }
  };
  if (window.__XS_QC || window.__XS_SE) { applyEngines(); }
  else {
    window.addEventListener('xs-engine-booted', applyEngines, { once: true });
    // Pengaman: jika event terlambat, coba baca ulang setelah 3 dtk.
    setTimeout(function () { if (!QC && !SE && (window.__XS_QC || window.__XS_SE)) applyEngines(); }, 3000);
  }
  // Fallback logo ramah-CSP (menggantikan atribut onerror inline yang diblokir CSP)
  try {
    Array.prototype.forEach.call(document.querySelectorAll('img[data-logo-fallback]'), function (img) {
      img.addEventListener('error', function () { img.style.display = 'none'; });
    });
  } catch (e) {}
  // i18n (round 6): saat bahasa diganti, render ulang semua bagian dinamis agar teks
  // mengikuti bahasa terpilih (katalog, radar, kartu investor, chip mode, panel user).
  window.addEventListener('xs-lang-changed', function () {
    try {
      if (window.XSI18N && typeof window.XSI18N.applyTranslationsToDOM === 'function') window.XSI18N.applyTranslationsToDOM();
      updateLandingCounts();
      renderInstrumentCatalog();
      updateUserUi();
      updateModeChip();
      syncTfBarForMode();
      syncHorizonTabs();
      try { syncModeButtonLabels(); } catch (e) {}
      // force=false: gunakan cache radar/kurasi bila ada (tidak memicu fetch ulang)
      if (state.mode === 'investor') renderInvestorPicks(false);
      else renderOpportunityRadar(false);
      try { renderSignalJournal(); } catch (e) {}
      try { updateSlPlusNotifyUi(); } catch (e) {}
      try { updateTelegramUi(); } catch (e) {}
      // Narasi analisis terakhir tetap — jalankan ulang analisis agar panel sisi ikut bahasa baru
      if (state.user && state.candles && state.candles.length && typeof window.runFullAnalysis === 'function') window.runFullAnalysis(true);
    } catch (e) {}
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootCore);
} else {
  bootCore();
}

// === XSTARZG_SAFE_REALTIME_TICKER_V2026_27 ===
(function () {
  let rtBusy = false;
  let rtLastTick = 0;
  const RT_TICK_MS = 5000;
  setInterval(async function () {
    if (rtBusy) return;
    try {
      if (typeof state === 'undefined' || !state || !state.symbol) return;
      /* HEMAT KUOTA CLOUDFLARE (v2026.66): Functions request dibatasi 100rb/hari
         di paket gratis, jadi ticker diperketat tanpa mengurangi fitur:
         1) tab latar belakang -> 0 request (document.hidden);
         2) kancelensi 1.5 dtk -> 5 dtk (harga terakhir tetap tampil dari state);
         3) crypto /USDT -> Binance langsung dari browser (gratis, tanpa kuota CF),
            edge Function tetap sebagai fallback penuh. */
      if (typeof document !== 'undefined' && document.hidden) return;
      const workEl = document.getElementById('appWorkspaceWrapper');
      if (workEl && workEl.classList.contains('hidden')) return;
      if (Date.now() - rtLastTick < RT_TICK_MS) return;
      rtLastTick = Date.now();
      rtBusy = true;
      const sym = state.symbol;
      const tf = state.tf || state.timeframe || 'H1';
      if ((sym || '').indexOf('/USDT') > -1) {
        try {
          const bc = new AbortController();
          const bt = setTimeout(function () { try { bc.abort(); } catch (e) {} }, 4000);
          const rB = await fetch('https://data-api.binance.vision/api/v3/ticker/price?symbol=' + sym.replace('/', ''), { signal: bc.signal });
          clearTimeout(bt);
          if (rB.ok) {
            const jB = await rB.json();
            const lpB = Number(jB && jB.price);
            if (lpB > 0 && state.symbol === sym && typeof applyLiveTick === 'function') {
              applyLiveTick(lpB, undefined, true);
              ['hdrLivePrice', 'livePriceDisplay', 'valCurrentPrice'].forEach(function (id) {
                const el = document.getElementById(id);
                if (el) el.textContent = typeof formatPrice === 'function' ? formatPrice(lpB, sym) : lpB;
              });
              rtBusy = false;
              return;
            }
          }
        } catch (eB) { /* lanjut ke edge Function di bawah */ }
      }
      const res = await fetch('/api/market/analyze?quote=1&symbol=' + encodeURIComponent(sym) + '&tf=' + encodeURIComponent(tf));
      if (res.ok) {
        const d = await res.json();
        const q = d && d.quote ? d.quote : null;
        if (q && Number(q.price) > 0 && state.symbol === sym) {
          const liveP = Number(q.price);
          const prevP = Number(state.livePrice) || liveP;
          // Teruskan ke satu jalur resmi: applyLiveTick membucket waktu TF dengan benar
          // (candle forming baru saat bucket berganti — chart bergerak sesuai waktu).
          if (typeof applyLiveTick === 'function') applyLiveTick(liveP, Number.isFinite(Number(q.changePct)) ? Number(q.changePct) : undefined, true);
          else state.livePrice = liveP;
          const fmt = typeof formatPrice === 'function' ? formatPrice(liveP, sym) : liveP.toLocaleString('en-US', { maximumFractionDigits: 2 });
          ['hdrLivePrice', 'livePriceDisplay', 'valCurrentPrice'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) {
              el.textContent = fmt;
              if (liveP !== prevP) {
                el.style.color = liveP > prevP ? '#10b981' : '#f43f5e';
              }
            }
          });
          if (Number.isFinite(Number(q.changePct))) {
            const chg = Number(q.changePct);
            ['hdrLiveChange', 'liveChangeDisplay'].forEach(function (id) {
              const el = document.getElementById(id);
              if (el) {
                el.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
                el.style.color = chg >= 0 ? '#10b981' : '#f43f5e';
              }
            });
          }
        }
      }
    } catch (e) {
      // Anti-stall: edge quote gagal/lemot -> crypto coba langsung Binance ticker ringan
      // supaya harga tampilan & candle tidak pernah tertinggal dari pasar.
      try {
        const sym2 = state.symbol;
        if ((sym2 || '').indexOf('/USDT') > -1) {
          const r2 = await fetch('https://data-api.binance.vision/api/v3/ticker/price?symbol=' + sym2.replace('/', ''), { cache: 'no-store' });
          if (r2.ok) {
            const j2 = await r2.json();
            const lp = Number(j2 && j2.price);
            if (lp > 0 && state.symbol === sym2 && typeof applyLiveTick === 'function') applyLiveTick(lp, undefined, true);
          }
        }
      } catch (e2) {}
    }
    rtBusy = false;
  }, 1500);
})();

// === XSTARZG_INSTANT_RENDER_GUARANTEE_V2026_30 ===
(function () {
  const SEED_PRICES = {
    // Harga jangkar dikalibrasi realistis ke pasar spot aktif — hanya dipakai 0-2 detik sebelum kuotasi live tiba
    'XAU/USD': 2680.00, 'XAU/IDR': 1405000, 'XAG/USD': 31.50, 'XPT/USD': 980.00, 'XPD/USD': 1050.00, 'XCU/USD': 4.30, 'HG/USD': 4.30,
    'EUR/USD': 1.0845, 'GBP/USD': 1.2960, 'USD/JPY': 152.40, 'USD/CHF': 0.8650, 'AUD/USD': 0.6580, 'USD/CAD': 1.3890,
    'NZD/USD': 0.5980, 'USD/IDR': 16550, 'BBCA.JK': 9850, 'BBRI.JK': 4420, 'BMRI.JK': 6150, 'BBNI.JK': 4880,
    'TLKM.JK': 2760, 'ASII.JK': 4950, 'ANTM.JK': 1620, 'NVDA': 142.50, 'AAPL': 234.80, 'MSFT': 428.00,
    'TSLA': 262.00, 'BTC/USDT': 100000.00, 'ETH/USDT': 3400.00, 'SOL/USDT': 200.00, 'BNB/USDT': 645.00,
    'SEI/USDT': 0.28, 'SEI': 0.28, 'KAS/USDT': 0.15, 'KAS': 0.15, 'USD/ZAR': 18.00, 'USDZAR': 18.00,
    'LDO/USDT': 1.45, 'KCS/USDT': 5.82, 'FET/USDT': 1.15, 'TAO/USDT': 450.00, 'RENDER/USDT': 4.80, 'PEPE/USDT': 0.00001,
    'RAY/USDT': 1.35, 'RAY': 1.35,
    'NZD/JPY': 87.35, 'NZDJPY': 87.35, 'AUD/JPY': 100.25, 'CAD/JPY': 109.60, 'CHF/JPY': 176.10, 'EUR/JPY': 165.20, 'GBP/JPY': 197.50
  };
  function generateSeedCandles(symbol, tf) {
    const sym = (symbol || 'XAU/USD').toUpperCase();
    const meta = (typeof getMeta === 'function' ? getMeta(sym) : null) || (typeof QC !== 'undefined' && QC && QC.getInstrumentMeta ? QC.getInstrumentMeta(sym) : null);
    const baseP = (meta && Number(meta.basePrice) > 0) ? Number(meta.basePrice) : (SEED_PRICES[sym] || 100);
    const tfSecMap = { 'M1': 60, 'M5': 300, 'M15': 900, 'M30': 1800, 'H1': 3600, 'H4': 14400, 'D1': 86400, 'W1': 604800, 'MN': 2592000, '1Y': 7776000 };
    const step = tfSecMap[tf] || 3600;
    const nowBucket = Math.floor(Date.now() / 1000 / step) * step;
    const atr = baseP * 0.0032;
    let seed = 0;
    for (let i = 0; i < sym.length; i++) seed = (seed * 31 + sym.charCodeAt(i)) % 1000003;
    const rand = () => { seed = (seed * 16807 + 11) % 2147483647; return (seed % 10000) / 10000; };
    const count = 180;
    const closes = new Array(count);
    closes[count - 1] = baseP;
    let cur = baseP;
    for (let i = count - 2; i >= 0; i--) {
      const wave = Math.sin(i * 0.15) * (atr * 0.20);
      const noise = (rand() - 0.500) * (atr * 0.45);
      cur = Math.max(baseP * 0.7, Math.min(baseP * 1.3, cur - noise - wave * 0.10));
      closes[i] = cur;
    }
    const out = [];
    for (let i = 0; i < count; i++) {
      const t = nowBucket - (count - 1 - i) * step;
      const o = i === 0 ? closes[0] * 0.999 : closes[i - 1];
      const c = closes[i];
      const wickUp = Math.max((0.2 + rand() * 0.5) * atr * 0.65, c * 0.0012);
      const wickDn = Math.max((0.2 + rand() * 0.5) * atr * 0.65, c * 0.0012);
      const h = Math.max(o, c) + wickUp;
      const l = Math.max(0.000001, Math.min(o, c) - wickDn);
      out.push({ time: t, open: o, high: h, low: l, close: c, volume: Math.round(120 + rand() * 800) });
    }
    return { price: baseP, candles: out };
  }
  // Fallback Canvas Candlestick Renderer jika CDN LightweightCharts diblokir ISP
  // v2026.63 REWRITE: axis harga nyata di kanan + tag level (ENTRY/SL/TP/DCA)
  // dari analysis.levels via effectiveLevels (bug lama: baca analysis.entry langsung
  // yang selalu undefined -> garis & harga SL/TP tidak pernah tergambar).
  function __fxEmaList(values, period) {
    const out = new Array(values.length).fill(null);
    if (values.length < period) return out;
    const k = 2 / (period + 1);
    let e = 0; for (let i = 0; i < period; i++) e += values[i]; e /= period;
    out[period - 1] = e;
    for (let i = period; i < values.length; i++) { e = values[i] * k + e * (1 - k); out[i] = e; }
    return out;
  }
  function drawCanvasFallbackChart(candles, analysis) {
    const container = document.getElementById('tvChartContainer');
    const skeleton = document.getElementById('tvChartLoadingSkeleton');
    if (skeleton) { try { skeleton.style.display = 'none'; } catch (e) {} }
    if (!container || (chartInstance && typeof LightweightCharts !== 'undefined')) return;
    let canvas = container.querySelector('canvas.xstarzg-fallback-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'xstarzg-fallback-canvas';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);
    }
    const w = container.clientWidth || 820;
    const h = container.clientHeight || 470;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, w, h);
    if (!candles || !candles.length) return;
    const slice = candles.slice(-90);
    const N = slice.length;

    // ---- Toggle indikator & level (sama dengan chart utama) ----
    const showEMA = $id('chkEMA') ? $id('chkEMA').checked : true;
    const showVWAP = $id('chkVWAP') ? $id('chkVWAP').checked : true;
    const showSMC = $id('chkSMC') ? $id('chkSMC').checked : true;
    const showSniper = $id('chkSniper') ? $id('chkSniper').checked : true;
    const L = (() => { try { return analysis ? effectiveLevels(analysis) : {}; } catch (e) { return (analysis && analysis.levels) || {}; } })();
    const fullCloses = candles.map(c => c.close);
    const ema20 = showEMA ? __fxEmaList(fullCloses, 20).slice(-N) : null;
    const ema50 = showEMA ? __fxEmaList(fullCloses, 50).slice(-N) : null;
    const ma200 = showEMA ? __fxEmaList(fullCloses, 200).slice(-N) : null;
    let vwapN = null;
    if (showVWAP && typeof QC !== 'undefined' && QC && QC.calcVWAP) {
      try { vwapN = (QC.calcVWAP(candles, Math.min(60, candles.length)).vwap || []).slice(-N); } catch (e) {}
    }

    // ---- Rentang harga mencakup candle DAN seluruh overlay/level aktif ----
    let maxP = -Infinity, minP = Infinity;
    slice.forEach(c => { if (c.high > maxP) maxP = c.high; if (c.low < minP) minP = c.low; });
    const absorb = (arr) => { if (!arr) return; for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (v != null && Number.isFinite(v)) { if (v > maxP) maxP = v; if (v < minP) minP = v; } } };
    absorb(ema20); absorb(ema50); absorb(ma200); absorb(vwapN);
    const lvlKeys = showSniper
      ? (state.mode === 'investor' ? ['dcaZone1', 'dcaZone2', 'dcaZone3', 'invTarget1', 'invTarget2'] : ['entry', 'sl', 'tp1', 'tp2'])
      : [];
    if (showSMC) lvlKeys.push('poc', 'swingHigh', 'swingLow');
    lvlKeys.forEach(k => {
      const v = Number(L[k]);
      if (Number.isFinite(v) && v > 0) {
        if (!slice.length || (maxP > 0 && v <= maxP * 3.5 && v >= minP * 0.28)) {
          if (v > maxP) maxP = v;
          if (v < minP) minP = v;
        }
      }
    });
    if (!Number.isFinite(maxP) || !Number.isFinite(minP) || maxP <= minP) { maxP = (candles[candles.length - 1].close || 100) * 1.01; minP = maxP * 0.98; }
    const pad = (maxP - minP) * 0.06 || 1;
    maxP += pad; minP -= pad;

    // ---- Geometri area plot & AXIS HARGA kanan (fix bug utama: tidak ada bacaan harga) ----
    const AX = 78;                 // lebar kolom axis harga kanan
    const top = 26, bottom = 20;   // ruang legenda atas & time axis bawah
    const plotR = w - AX - 6;      // batas kanan area candle
    const yOf = (p) => top + (maxP - p) * (h - top - bottom) / (maxP - minP);
    const yClamp = (y) => Math.max(top + 6, Math.min(h - bottom - 2, y));
    // fxPriceAxis: tick genap (nice numbers) — dibaca kanan-kiri seperti chart TradingView
    function fxPriceAxis(rangeMax, rangeMin, count) {
      const rawStep = (rangeMax - rangeMin) / count;
      const mag = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
      const norm = rawStep / mag;
      const stepM = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
      const t0 = Math.ceil(rangeMin / stepM) * stepM;
      const out = [];
      for (let v = t0; v <= rangeMax; v += stepM) if (out.length < 14) out.push(v); else break;
      return out;
    }
    ctx.font = '10px monospace';
    ctx.textBaseline = 'middle';
    fxPriceAxis(maxP, minP, 6).forEach(v => {
      const y = yOf(v);
      if (y < top || y > h - bottom) return;
      ctx.strokeStyle = 'rgba(148,163,184,0.10)';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotR, y); ctx.stroke();
      const txt = formatPrice(v, analysis ? analysis.symbol : undefined);
      ctx.fillStyle = '#64748b';
      ctx.fillText(txt, plotR + 6, y);
    });
    // garis frame plot
    ctx.strokeStyle = 'rgba(148,163,184,0.18)';
    ctx.strokeRect(0.5, top + 0.5, plotR, h - top - bottom);

    // ---- Candlestick ----
    const stepX = plotR / N;
    const barW = Math.max(2, stepX * 0.68);
    slice.forEach((c, idx) => {
      const x = idx * stepX + (stepX - barW) / 2;
      const isUp = c.close >= c.open;
      ctx.strokeStyle = isUp ? '#10b981' : '#f43f5e';
      ctx.fillStyle = isUp ? '#10b981' : '#f43f5e';
      ctx.beginPath();
      ctx.moveTo(x + barW / 2, yOf(c.high));
      ctx.lineTo(x + barW / 2, yOf(c.low));
      ctx.stroke();
      const yTop = yOf(Math.max(c.open, c.close));
      const yBot = yOf(Math.min(c.open, c.close));
      ctx.fillRect(x, yTop, barW, Math.max(1.5, yBot - yTop));
    });

    // ---- Garis overlay (EMA20/50/200 + VWAP) ----
    const plotLine = (arr, col, dashed) => {
      if (!arr) return;
      ctx.strokeStyle = col; ctx.lineWidth = 1.4;
      ctx.setLineDash(dashed ? [5, 4] : []);
      ctx.beginPath(); let started = false;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (v == null || !Number.isFinite(v)) continue;
        const x = i * stepX + stepX / 2, y = yOf(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
    };
    plotLine(ema20, '#38bdf8', false);
    plotLine(ema50, '#eab308', false);
    plotLine(ma200, '#a855f7', false);
    plotLine(vwapN, '#ec4899', true);

    // ---- Tag level (harga) di tepi axis: lvTag ----
    function lvTag(p, col, lbl, dash) {
      const v = Number(p);
      if (!Number.isFinite(v) || v <= 0) return;
      const y = yClamp(yOf(v));
      ctx.strokeStyle = col;
      ctx.setLineDash(dash === 0 ? [] : [5, 4]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotR, y); ctx.stroke();
      ctx.setLineDash([]);
      const txt = lbl + ' ' + formatPrice(v, analysis ? analysis.symbol : undefined);
      ctx.font = 'bold 10px monospace';
      const tw = ctx.measureText(txt).width + 8;
      const x0 = w - tw - 4;
      ctx.fillStyle = col;
      ctx.fillRect(x0, y - 8, tw, 15);
      ctx.fillStyle = '#0b1020';
      ctx.fillText(txt, x0 + 4, y);
    }
    if (showSMC) {
      lvTag(L.poc, '#eab308', 'POC', 1);
      if (L.swingHigh > 0) lvTag(L.swingHigh, 'rgba(244,63,94,0.85)', 'SUPPLY', 1);
      if (L.swingLow > 0) lvTag(L.swingLow, 'rgba(16,185,129,0.85)', 'DEMAND', 1);
    }
    if (showSniper) {
      if (state.mode === 'investor') {
        lvTag(L.dcaZone1, '#10b981', 'DCA1'); lvTag(L.dcaZone2, '#34d399', 'DCA2'); lvTag(L.dcaZone3, '#6ee7b7', 'DCA3');
        lvTag(L.invTarget1, '#38bdf8', 'T1'); lvTag(L.invTarget2, '#818cf8', 'T2');
      } else {
        const isBeActive = (analysis && analysis.tradeManagement && analysis.tradeManagement.bePlusActive) || (L && L.bePlusActive) || (analysis && analysis.lockedSignal && analysis.lockedSignal.bePlusActive);
        const slPlusVal = (L && L.slPlus) || (analysis && analysis.lockedSignal && analysis.lockedSignal.slPlus);
        lvTag(L.entry, '#38bdf8', 'ENTRY', 0);
        if (isBeActive && Number(slPlusVal) > 0) {
          lvTag(slPlusVal, '#10b981', 'SL+ (0-RISK)', 0);
          lvTag(L.sl, 'rgba(244,63,94,0.35)', 'SL (BE+)', 1);
        } else {
          lvTag(L.sl, '#f43f5e', 'SL', 1);
        }
        lvTag(L.tp1, '#10b981', 'TP1', 1);
        lvTag(L.tp2, '#34d399', 'TP2', 1);
      }
    }

    // ---- Harga TERKINI: garis penuh + pil harga di axis ----
    const lastC = candleLastPrice(sourceSafe(candles));
    function candleLastPrice(arr) { const c = arr[arr.length - 1]; return c && Number.isFinite(c.close) ? c.close : 0; }
    function sourceSafe(a) { return a && a.length ? a : []; }
    if (lastC > 0) {
      const y = yClamp(yOf(lastC));
      const up = slice[N - 1].close >= (slice[N - 2] ? slice[N - 2].close : slice[N - 1].open);
      const col = up ? '#10b981' : '#f43f5e';
      ctx.strokeStyle = col; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotR, y); ctx.stroke(); ctx.setLineDash([]);
      const txt = formatPrice(lastC, analysis ? analysis.symbol : undefined);
      ctx.font = 'bold 10px monospace';
      const tw = ctx.measureText(txt).width + 8;
      ctx.fillStyle = col; ctx.fillRect(plotR + 2, y - 8, Math.min(tw, AX - 2), 15);
      ctx.fillStyle = '#ffffff'; ctx.fillText(txt, plotR + 6, y);
    }

    // ---- Legenda indikator rapi (kiri atas) ----
    ctx.font = 'bold 9.5px monospace';
    let lx = 8; const ly = 13;
    const legend = (txt, col) => {
      const tw = ctx.measureText(txt).width + 14;
      if (lx + tw > plotR) return;
      ctx.fillStyle = 'rgba(11,16,32,0.72)'; ctx.fillRect(lx, ly - 8, tw, 16);
      ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(lx + 3, ly); ctx.lineTo(lx + 10, ly); ctx.stroke();
      ctx.fillStyle = '#cbd5e1'; ctx.fillText(txt, lx + 12, ly);
      lx += tw + 4;
    };
    if (ema20) legend('EMA20', '#38bdf8');
    if (ema50) legend('EMA50', '#eab308');
    if (ma200) legend('MA200', '#a855f7');
    if (vwapN) legend('VWAP', '#ec4899');
    ctx.fillStyle = '#475569'; ctx.font = '9px monospace';
    ctx.fillText('FALLBACK VIEW — axis harga aktif', 8, h - 7);
  }
    // Expose untuk heartbeat live-tick (anti-desync chart vs harga saat CDN diblokir)
  window.__canvasRenderer = drawCanvasFallbackChart;
  window.drawCanvasFallbackChart = drawCanvasFallbackChart;
  window.generateSeedCandles = generateSeedCandles;
  window.SEED_PRICES = SEED_PRICES;
  let analysisRequestSeq = 0;
  let activeAnalysisController = null;
  // Do not block the UI with a second full quant calculation on synthetic seed candles.
  // Seed candles are only a visual placeholder; the complete engine runs once real data arrives.
  window.runFullAnalysis = async function (forceRecalc = false) {
    if (!state.manualInstrumentSelection) {
      setTxt('lblEngineStatus', 'Pilih instrumen secara manual, lalu tekan Analisis.');
      return null;
    }
    const mySeq = ++analysisRequestSeq;
    const reqSymbol = state.symbol;
    const reqTf = state.tf;
    if (activeAnalysisController) {
      try { activeAnalysisController.abort(); } catch (e) {}
    }
    const requestController = new AbortController();
    activeAnalysisController = requestController;
    try {
      if (!chartInstance && typeof initChart === 'function') initChart();
      try { auditAndCleanseCorruptedStorage(); } catch (e) {}

      // Initial workspace entry only: draw a lightweight seed preview without running
      // computeQuantEngine/renderAllVisuals. A timeframe switch retains the prior bars
      // and therefore skips this branch entirely.
      if (!state.candles || state.candles.length === 0 || (state.lastAnalysis && state.lastAnalysis.symbol !== reqSymbol)) {
        const seeded = generateSeedCandles(reqSymbol, reqTf);
        if (mySeq !== analysisRequestSeq || state.symbol !== reqSymbol || state.tf !== reqTf) return;
        state.candles = seeded.candles;
        state.livePrice = seeded.price;
        state.liveChangePct = 0.25;
        state.feedSource = 'LOCAL_SEED';
        state.lastAnalysis = null;
        renderSeedCandlesPreview(state.candles);
      }

      setTxt('lblEngineStatus', '⏳ MEMUAT ' + reqTf + ' — mengambil candle broker…');
      const data = await fetchRealMarketCandles(reqSymbol, reqTf, requestController);
      // Ignore responses from requests superseded by a newer symbol/timeframe selection.
      if (mySeq !== analysisRequestSeq || state.symbol !== reqSymbol || state.tf !== reqTf) return;
      if (data && data.symbol && data.symbol !== reqSymbol) return;

      // Successful HTTP responses can still contain broker-fallback/synthetic candles.
      // Show them as an unverified preview only; never spend a full quant pass on them.
      if (data && Array.isArray(data.candles) && data.candles.length >= 5 && feedIsEstimate(data.source)) {
        const estimatedLastBar = data.candles[data.candles.length - 1];
        if (!isPriceCompatibleWithSymbol(estimatedLastBar.close, reqSymbol)) return;
        state.candles = data.candles;
        state.livePrice = Number(data.price) || estimatedLastBar.close;
        state.liveChangePct = Number(data.changePct) || 0;
        state.feedSource = data.source || 'EDGE_SYNTHETIC_CALIBRATED';
        state.lastAnalysis = null;
        renderSeedCandlesPreview(state.candles);
        setTxt('lblEngineStatus', '⚠ FEED ESTIMASI — preview saja; sinyal belum diverifikasi');
        connectRealtimeStream();
        scheduleFeedReconnect();
        return;
      }

      if (data && Array.isArray(data.candles) && data.candles.length >= 5) {
        const lastBar = data.candles[data.candles.length - 1];
        if (!isPriceCompatibleWithSymbol(lastBar.close, reqSymbol)) return;
        state.candles = data.candles;
        state.livePrice = Number(data.price) || lastBar.close;
        state.liveChangePct = Number(data.changePct) || 0.25;
        state.feedSource = data.source || 'LIVE_BROKER';
        if (!feedIsEstimate(state.feedSource) && feedReconnectTimer) {
          try { clearInterval(feedReconnectTimer); feedReconnectTimer = null; } catch (e) {}
        }
        // Exactly one full quant pass per successful timeframe response.
        const analysis = computeQuantEngine(state.candles, reqSymbol, reqTf, forceRecalc, 'create', data.source || 'LIVE_BROKER');
        if (mySeq !== analysisRequestSeq || state.symbol !== reqSymbol || state.tf !== reqTf) return;
        renderAllVisuals(analysis, true);
        drawCanvasFallbackChart(state.candles, analysis);
        if (chartInstance) chartInstance.timeScale().fitContent();
        connectRealtimeStream();
        if (feedIsEstimate(state.feedSource)) scheduleFeedReconnect();
      }
    } catch (err) {
      if (mySeq !== analysisRequestSeq || state.symbol !== reqSymbol || state.tf !== reqTf) return;
      // Do not run the expensive quant engine over synthetic fallback candles.
      // Keep the chart usable, mark the feed as unverified, and allow a retry.
      const seeded = generateSeedCandles(reqSymbol, reqTf);
      state.candles = seeded.candles;
      state.livePrice = seeded.price;
      state.liveChangePct = 0;
      state.feedSource = 'LOCAL_SEED';
      state.lastAnalysis = null;
      renderSeedCandlesPreview(state.candles);
      setTxt('lblEngineStatus', '⚠ FEED ' + reqTf + ' TIDAK TERSEDIA — pratinjau lokal, sinyal belum diverifikasi');
      scheduleFeedReconnect();
      connectRealtimeStream();
    } finally {
      if (activeAnalysisController === requestController) activeAnalysisController = null;
    }
  };
  // Pre-warm radar & initial analysis on load
  var __xsBootPostDomStarted = false;
  function bootPostDom() {
    if (__xsBootPostDomStarted) return;
    __xsBootPostDomStarted = true;
    setTimeout(function () {
      // Do not compute/render seed analysis while the landing or login screen is visible.
      var workEl = document.getElementById('appWorkspaceWrapper');
      var isInWork = workEl && !workEl.classList.contains('hidden');
      if (isInWork && (!state.candles || !state.candles.length)) {
        try {
          const seeded = generateSeedCandles(state.symbol, state.tf);
          state.candles = seeded.candles;
          state.livePrice = seeded.price;
          state.feedSource = 'LOCAL_SEED';
          state.lastAnalysis = null;
          renderSeedCandlesPreview(state.candles);
        } catch (eInitAn) {}
      }
      // Initial background feeds run only after an actual workspace entry.
      if (isInWork) {
        try { renderOpportunityRadar(); } catch (e) {}
        try { fetchNewsCalendar(false); } catch (e) {}
        try { fetchMacroRegime(false); } catch (e) {}
        try { renderMacroMap(); } catch (e) {}
        try { renderSignalJournal(); } catch (e) {}
        // DEX/Meme scanner is loaded on demand when the user opens Meme mode; do not fetch it during Trader/Investor startup.
      }
      setInterval(function () {
        var w = document.getElementById('appWorkspaceWrapper');
        if (w && !w.classList.contains('hidden')) {
          try { fetchNewsCalendar(false); } catch (e) {}
        }
      }, 15 * 60 * 1000);
      setInterval(function () {
        var w = document.getElementById('appWorkspaceWrapper');
        if (w && !w.classList.contains('hidden')) {
          try { fetchMacroRegime(false); } catch (e) {}
        }
      }, MACRO_TTL);
      setInterval(function () {
        var w = document.getElementById('appWorkspaceWrapper');
        if (w && !w.classList.contains('hidden')) {
          try { renderMacroMap(); } catch (e) {}
        }
      }, 60 * 1000);
      setInterval(function () {
        var w = document.getElementById('appWorkspaceWrapper');
        if (w && !w.classList.contains('hidden')) {
          try { renderSignalJournal(); } catch (e) {}
        }
      }, 60 * 1000);
      try { loadPersistedAlarm(); } catch (e) {}
      var nfBar = $id('newsFilterBar');
      if (nfBar) nfBar.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-nf]') : null;
        if (!b) return;
        newsState.filter = b.getAttribute('data-nf');
        nfBar.querySelectorAll('.hz-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
        renderNewsPanel();
      });

      var rgBar = $id('radarGroupBar');
      if (rgBar) rgBar.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-rg]') : null;
        if (!b) return;
        state.radarGroup = b.getAttribute('data-rg') || 'all';
        rgBar.querySelectorAll('.hz-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
        renderOpportunityRadar(false);
      });

      var viabBar = $id('radarViabilityBar');
      if (viabBar) viabBar.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-viab]') : null;
        if (!b) return;
        state.radarViability = b.getAttribute('data-viab') || 'actionable';
        viabBar.querySelectorAll('.hz-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
        renderOpportunityRadar(false);
      });

      // ==================== PWA INSTALL & SERVICE WORKER ====================
      if ('serviceWorker' in navigator) {
        var registerSW = function () {
          navigator.serviceWorker.register('/sw.js').then(function (reg) {
            try { reg.update(); } catch (e) {}
            reg.addEventListener('updatefound', function () {
              var newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', function () {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    try { newWorker.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
                  }
                });
              }
            });
          }).catch(function (err) {
            console.warn('SW registration failed:', err);
          });
        };
        if (document.readyState === 'complete') {
          registerSW();
        } else {
          window.addEventListener('load', registerSW);
        }
        var isInitialController = !!navigator.serviceWorker.controller;
        var swPageStartTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
        var refreshing = false;
                navigator.serviceWorker.addEventListener('controllerchange', function () {
          // Never force a page reload: SW activation is sufficient, and forced
          // reloads can create Android WebAPK splash/startup loops.
          try {
            var isPwaStandalone = (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (typeof navigator !== 'undefined' && navigator.standalone === true);
            if (isPwaStandalone) return;
          } catch (ePwa) {}
          return;
        });
      }

      var deferredPwaPrompt = null;
      var btnNavInstall = $id('btnNavInstallPwa');
      var btnInstallPwa = $id('btnInstallPwa');
      var isStandalone = false;
      try {
        isStandalone = (typeof window !== 'undefined' && window.matchMedia && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)') && window.matchMedia('(display-mode: standalone)').matches) || (typeof window !== 'undefined' && window.navigator && window.navigator.standalone === true);
      } catch (e) {
        isStandalone = false;
      }

      function updatePwaInstallUI(show) {
        if (isStandalone) {
          if (btnNavInstall) btnNavInstall.classList.add('hidden');
          if (btnInstallPwa) btnInstallPwa.classList.add('hidden');
          return;
        }
        if (btnNavInstall) btnNavInstall.classList.toggle('hidden', !show);
        if (btnInstallPwa) btnInstallPwa.classList.toggle('hidden', !show);
      }

      if (!isStandalone) {
        updatePwaInstallUI(true);
      }

      window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPwaPrompt = e;
        updatePwaInstallUI(true);
      });

      function handlePwaInstallAction() {
        if (deferredPwaPrompt) {
          deferredPwaPrompt.prompt();
          deferredPwaPrompt.userChoice.then(function (res) {
            if (res && res.outcome === 'accepted') {
              updatePwaInstallUI(false);
            }
            deferredPwaPrompt = null;
          });
        } else {
          alert(T('ui.pwaInstallGuide', 'Instalasi Aplikasi XStarZG (Mode APK / PWA):\n\n' +
            '• Android Chrome: Ketuk menu titik tiga (⋮) di kanan atas browser, lalu pilih "Tambahkan ke Layar Utama" / "Instal Aplikasi".\n' +
            '• iPhone / iPad (Safari): Ketuk tombol Share (ikon kotak berpanah ke atas), lalu pilih "Tambahkan ke Layar Utama" (Add to Home Screen).\n\n' +
            'Aplikasi terinstal langsung seperti APK tanpa biaya dan dapat dibuka offline!'));
        }
      }

      if (btnNavInstall) btnNavInstall.addEventListener('click', handlePwaInstallAction);
      if (btnInstallPwa) btnInstallPwa.addEventListener('click', handlePwaInstallAction);

      window.addEventListener('appinstalled', function () {
        deferredPwaPrompt = null;
        updatePwaInstallUI(false);
      });
    }, 50);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootPostDom);
  } else {
    bootPostDom();
  }
})();
