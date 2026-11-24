// Recommendation scanners have been retired. DEX instruments are selected manually.
export async function onRequestGet() {
  return Response.json(
    { ok: false, disabled: true, message: 'DEX discovery scanner has been retired; use manual instrument selection.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  );
}
export async function onRequest() {
  return Response.json(
    { ok: false, disabled: true, message: 'DEX discovery scanner has been retired; use manual instrument selection.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  );
}
