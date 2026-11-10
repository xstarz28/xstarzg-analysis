import { authenticateRequest } from '../../lib/auth.js';
export async function onRequestGet(context) {
  const user = await authenticateRequest(context.request, context.env);
  if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  return Response.json({ ok: true, user });
}
