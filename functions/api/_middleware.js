// Middleware ringan untuk seluruh rute /api/* — meneruskan request ke handler
// endpoint yang sebenarnya (context.next) lalu menambahkan header keamanan/no-store.
// SEBELUMNYA: stub `return Response.json({ok:true})` menelan SEMUA request API sehingga
// endpoint market/auth/billing tidak pernah tereksekusi (penyebab harga non-crypto mati).
export async function onRequest(context) {
  try {
    const res = await context.next();
    const headers = new Headers(res.headers);
    if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
    if (!headers.has('X-Content-Type-Options')) headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } catch (e) {
    return Response.json({ ok: false, error: 'API middleware: ' + (e && e.message ? e.message : 'error') }, { status: 500 });
  }
}
