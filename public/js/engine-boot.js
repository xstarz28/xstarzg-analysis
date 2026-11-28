// Loader engine kuantitatif sebagai berkas modul eksternal.
// Dipisah dari app.js agar Content-Security-Policy ketat bisa aktif tanpa 'unsafe-eval'
// (sebelumnya app.js memakai trik `new Function('return import(p)')` yang diblokir CSP).
Promise.all([
  import('/js/shared/quant-core.js?v=2027.26'),
  import('/js/shared/signal-engine.js?v=2027.26'),
  import('/js/shared/group-analysis.js?v=2027.26')
]).then(function (mods) {
  window.__XS_QC = mods[0] || null;
  window.__XS_SE = mods[1] || null;
  window.XSGroup = mods[2] || null;
  window.dispatchEvent(new Event('xs-engine-booted'));
}).catch(function () {
  window.dispatchEvent(new Event('xs-engine-booted'));
});

/* v2026.65: boot Kalkulator Ukuran Posisi (fitur lama dipulihkan) */
import('/js/calculator.js?v=2027.26').then(function (m) {
  function initCalc() {
    try {
      window.__calcWidget = new m.PositionCalculator();
      window.__calcWidget.init();
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCalc);
  else initCalc();
}).catch(function () {});
