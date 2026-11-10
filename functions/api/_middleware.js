export async function onRequest(context) {
  const { request, next } = context;
  const t0 = performance.now();
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    });
  }
  try {
    const response = await next();
    const elapsedMs = (performance.now() - t0).toFixed(2);
    const headers = new Headers(response.headers);
    if (!headers.has('X-Compute-Time-Ms')) {
      headers.set('X-Compute-Time-Ms', String(elapsedMs));
    }
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (err) {
    const elapsedMs = (performance.now() - t0).toFixed(2);
    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message || 'Internal Server Error',
        computeMs: Number(elapsedMs)
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Compute-Time-Ms': String(elapsedMs)
        }
      }
    );
  }
}