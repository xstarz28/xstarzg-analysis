export function getUtcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
export async function getTodayProviderCredits(db, provider = 'twelvedata') {
  if (!db) return 0;
  const periodDate = getUtcDateString();
  try {
    const row = await db
      .prepare('SELECT credits_used FROM api_credit_usage WHERE provider = ? AND period_date = ? LIMIT 1')
      .bind(provider, periodDate)
      .first();
    return Number(row?.credits_used || 0);
  } catch (_) {
    return 0;
  }
}
export async function incrementProviderCredits(db, provider = 'twelvedata', delta = 1) {
  if (!db) return 0;
  const periodDate = getUtcDateString();
  const nowSec = Math.floor(Date.now() / 1000);
  try {
    await db
      .prepare(
        `INSERT INTO api_credit_usage (provider, period_date, credits_used, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(provider, period_date) DO UPDATE SET
           credits_used = api_credit_usage.credits_used + excluded.credits_used,
           updated_at = excluded.updated_at`
      )
      .bind(provider, periodDate, delta, nowSec)
      .run();
    return await getTodayProviderCredits(db, provider);
  } catch (_) {
    return 0;
  }
}