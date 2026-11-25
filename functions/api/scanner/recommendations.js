// Multi-instrument recommendation scanning is permanently disabled in the analysis terminal.
export async function onRequestGet() {
  return Response.json({ ok: false, disabled: true, message: 'Recommendation engine has been retired.' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
export async function onRequest() {
  return Response.json({ ok: false, disabled: true, message: 'Recommendation engine has been retired.' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
