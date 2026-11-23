// Boot i18n (round 6): dimuat sebagai berkas modul eksternal — CSP ketat tanpa inline.
// Mengisi seluruh <select data-lang-select>, menerapkan terjemahan awal (localStorage /
// navigator), dan menyebarkan event 'xs-lang-changed' agar app.js me-render ulang bagian
// dinamis (radar, kartu investor, katalog) dalam bahasa yang baru dipilih.
import {
  SUPPORTED_LANGUAGES,
  detectInitialLanguage,
  setLanguage,
  getLanguage,
  t,
  applyTranslationsToDOM
} from './index.js';

function fillLangSelects() {
  document.querySelectorAll('select[data-lang-select]').forEach(function (sel) {
    if (sel.options.length >= SUPPORTED_LANGUAGES.length) return; // sudah lengkap
    var currentVal = sel.value || getLanguage() || 'id';
    sel.innerHTML = '';
    SUPPORTED_LANGUAGES.forEach(function (l) {
      var opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = l.flag + ' ' + l.nativeName;
      if (l.code === currentVal) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}
function syncSelects() {
  var cur = getLanguage();
  document.querySelectorAll('select[data-lang-select]').forEach(function (sel) { sel.value = cur; });
}

async function applyLang(code, isInitial) {
  await setLanguage(code);
  applyTranslationsToDOM();
  syncSelects();
  // app.js mendengarkan event ini untuk me-render ulang konten dinamis dari CACHE
  // (tanpa fetch ulang). Selalu dikirim — termasuk penerapan awal — supaya badge,
  // chip mode, dan kartu radar langsung mengikuti bahasa tersimpan/bahasa browser.
  window.dispatchEvent(new Event('xs-lang-changed'));
}

window.XSI18N = {
  t: t,
  getLanguage: getLanguage,
  setLanguage: function (code) { return applyLang(code, false); },
  applyTranslationsToDOM: applyTranslationsToDOM,
  SUPPORTED_LANGUAGES: SUPPORTED_LANGUAGES
};

fillLangSelects();
document.addEventListener('change', function (ev) {
  var sel = ev.target && ev.target.closest ? ev.target.closest('select[data-lang-select]') : null;
  if (sel && sel.value) applyLang(sel.value, false);
});
// Terjemahan awal sesuai bahasa tersimpan / bahasa browser pengunjung internasional
applyLang(detectInitialLanguage(), true);
