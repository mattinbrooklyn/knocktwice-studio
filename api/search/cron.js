// GET /api/search/cron  (Vercel cron, daily)
// Refreshes the most stale enabled brands until the time budget runs out. Over
// a week every brand gets refreshed at least once. Requires the CRON_SECRET
// header that Vercel attaches to scheduled invocations.
import { makeContext, isCronRequest } from '../../search/context.js';
import { ingestBrand } from '../../search/ingest.js';

const TOTAL_BUDGET_MS = 280_000;
const PER_BRAND_MS = 120_000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isCronRequest(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });

  let ctx;
  try {
    ctx = makeContext();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
  const { db, log } = ctx;
  const started = Date.now();
  const hardDeadline = started + TOTAL_BUDGET_MS;

  const brands = await db.query(
    `SELECT b.*, (SELECT max(r.finished_at) FROM ingest_runs r WHERE r.brand_id = b.id AND r.status = 'ok') AS last_ok
     FROM brands b WHERE b.enabled ORDER BY last_ok NULLS FIRST, b.id`,
  );

  const results = [];
  for (const brand of brands) {
    const remaining = hardDeadline - Date.now();
    if (remaining < 30_000) break;
    log(`cron: ${brand.id} (last ok ${brand.last_ok || 'never'})`);
    const r = await ingestBrand(ctx, brand, { trigger: 'cron', deadline: Date.now() + Math.min(PER_BRAND_MS, remaining - 10_000) });
    results.push({ brand: brand.id, ok: r.ok, strategy: r.strategy, found: r.productsFound, errors: r.errors.length });
  }
  return res.status(200).json({ ok: true, elapsedMs: Date.now() - started, brandsQueued: brands.length, ran: results });
}
