// Loader engine kuantitatif sebagai berkas modul eksternal.
// Dipisah dari app.js agar Content-Security-Policy ketat bisa aktif tanpa 'unsafe-eval'
// (sebelumnya app.js memakai trik `new Function('return import(p)')` yang diblokir CSP).
Promise.all([
  import('/js/shared/quant-core.js?v=2026.54'),
  import('/js/shared/signal-engine.js?v=2026.54')
]).then(function (mods) {
  window.__XS_QC = mods[0] || null;
  window.__XS_SE = mods[1] || null;
  window.dispatchEvent(new Event('xs-engine-booted'));
}).catch(function () {
  window.dispatchEvent(new Event('xs-engine-booted'));
});
