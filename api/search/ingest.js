// GET /api/search/ingest?brand=<id>
// Runs ingest for one brand and returns the run summary.
//
// Auth today: Vercel cron (Authorization: Bearer CRON_SECRET) is trusted.
// Anyone else is throttled to one successful run per brand per 30 minutes (failed runs can be retried). The password
// middleware (Step 7) closes this to logged-in users only.
import { waitUntil } from '@vercel/functions';
import { makeContext, isCronRequest } from '../../search/context.js';
import { ingestBrand } from '../../search/ingest.js';

const THROTTLE_MINUTES = 30;
const BUDGET_MS = 280_000;

const BATCH_BUDGET_MS = 45_000;
const BATCH_PER_BRAND_MS = 40_000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const brandId = String(req.query?.brand || '').trim();
  if (brandId === 'batch') return batch(req, res);
  if (!brandId) return res.status(400).json({ ok: false, error: 'brand query parameter required' });

  let ctx;
  try {
    ctx = makeContext();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
  const { db } = ctx;
  const trusted = isCronRequest(req);

  const [brand] = await db.query(`SELECT * FROM brands WHERE id = $1`, [brandId]);
  if (!brand) return res.status(404).json({ ok: false, error: `unknown brand ${brandId}` });

  if (!trusted) {
    const [recent] = await db.query(
      `SELECT id, started_at FROM ingest_runs WHERE brand_id = $1 AND status IN ('ok', 'running')
         AND started_at > now() - ($2 || ' minutes')::interval ORDER BY started_at DESC LIMIT 1`,
      [brandId, String(THROTTLE_MINUTES)],
    );
    if (recent) {
      return res.status(429).json({ ok: false, error: `brand ${brandId} was ingested at ${recent.started_at}; try again after ${THROTTLE_MINUTES} minutes`, runId: recent.id });
    }
  }

  const result = await ingestBrand(ctx, brand, { trigger: trusted ? 'cron' : 'manual', deadline: Date.now() + BUDGET_MS });
  return res.status(result.ok ? 200 : 502).json(result);
}

/**
 * GET /api/search/ingest?brand=batch
 * Runs enabled brands that have never succeeded (then the most stale) for
 * about two minutes and returns what happened. Call repeatedly to sweep the
 * registry without waiting for the production cron.
 */
async function batch(req, res) {
  let ctx;
  try {
    ctx = makeContext();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
  const { db, log } = ctx;
  const started = Date.now();
  const deadline = started + BATCH_BUDGET_MS;
  // Never-tried brands first, then the ones with the fewest recent failures, then the most stale.
  // Brands that failed three times in the last day are left for a manual run with a bigger budget.
  const brands = await db.query(
    `SELECT b.*,
       (SELECT max(r.finished_at) FROM ingest_runs r WHERE r.brand_id = b.id AND r.status = 'ok') AS last_ok,
       (SELECT max(r.started_at) FROM ingest_runs r WHERE r.brand_id = b.id) AS last_try,
       (SELECT count(*) FROM ingest_runs r WHERE r.brand_id = b.id AND r.status = 'error' AND r.started_at > now() - interval '1 day') AS recent_failures
     FROM brands b WHERE b.enabled
       AND NOT EXISTS (SELECT 1 FROM ingest_runs r WHERE r.brand_id = b.id AND r.status IN ('ok', 'running')
                         AND r.started_at > now() - ($1 || ' minutes')::interval)
       AND (SELECT count(*) FROM ingest_runs r WHERE r.brand_id = b.id AND r.status = 'error' AND r.started_at > now() - interval '1 day') < 3
     ORDER BY last_ok NULLS FIRST, recent_failures ASC, last_try NULLS FIRST, b.id`,
    [String(THROTTLE_MINUTES)],
  );
  const ran = [];
  for (const brand of brands) {
    const remaining = deadline - Date.now();
    if (remaining < 15_000) break;
    log(`batch: ${brand.id}`);
    const r = await ingestBrand(ctx, brand, { trigger: 'manual', deadline: Date.now() + Math.min(BATCH_PER_BRAND_MS, remaining - 5_000) });
    ran.push({ brand: brand.id, ok: r.ok, strategy: r.strategy, found: r.productsFound, dims: r.withDimensions,
      firstError: r.errors.find((e) => e.stage !== 'embed')?.message || null, notes: r.notes.filter((n) => !n.includes('BLOB')) });
  }
  // ?chain=N keeps sweeping: each call fires the next one until nothing is queued (max 40 hops).
  const chain = Number(req.query?.chain) || 0;
  let next = null;
  if (chain > 0 && chain <= 40 && ran.length > 0 && brands.length > ran.length) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    next = `https://${host}/api/search/ingest?brand=batch&chain=${chain + 1}`;
    // Keep this invocation alive until the next hop has answered, so the hand-off cannot be cut short.
    waitUntil(fetch(next, { signal: AbortSignal.timeout(58_000) }).catch(() => {}));
  }
  return res.status(200).json({ ok: true, elapsedMs: Date.now() - started, queued: brands.length, ran, next });
}
