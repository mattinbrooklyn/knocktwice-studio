// GET /api/search/ingest?brand=<id>
// Runs ingest for one brand and returns the run summary.
//
// Auth today: Vercel cron (Authorization: Bearer CRON_SECRET) is trusted.
// Anyone else is throttled to one successful run per brand per 30 minutes (failed runs can be retried). The password
// middleware (Step 7) closes this to logged-in users only.
import { makeContext, isCronRequest } from '../../search/context.js';
import { ingestBrand } from '../../search/ingest.js';

const THROTTLE_MINUTES = 30;
const BUDGET_MS = 280_000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const brandId = String(req.query?.brand || '').trim();
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
