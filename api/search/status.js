// GET /api/search/status
// Applies the schema (idempotent), syncs the brand registry, and reports what
// the database holds. Read-only from the caller's point of view: calling it
// twice changes nothing. Guarded by the search password middleware in Step 7.
import { getDb, ensureSchema, syncBrands, summary } from '../../search/db.js';

const EXPECTED = ['DATABASE_URL', 'OPENAI_API_KEY', 'SEARCH_PASSWORD', 'CRON_SECRET', 'BLOB_READ_WRITE_TOKEN'];

/** Names only, never values: which expected variables exist, plus any similarly named ones. */
function envReport() {
  const present = Object.fromEntries(EXPECTED.map((k) => [k, Boolean(process.env[k])]));
  const similar = Object.keys(process.env).filter((k) => /OPENAI|SEARCH|CRON|BLOB|NEON|POSTGRES|DATABASE/i.test(k) && !EXPECTED.includes(k)).sort();
  return { present, otherRelatedNames: similar, vercelEnv: process.env.VERCEL_ENV || null };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'GET only' });
  }
  try {
    const db = getDb();
    const statementsApplied = await ensureSchema(db);
    const brandsSynced = await syncBrands(db);
    const s = await summary(db);
    res.setHeader('Cache-Control', 'no-store');
    if (req.query?.report) {
      // Compact, one line per brand: id status strategy products/dims/embedded error
      const lines = s.brandReport.map((b) => [
        b.enabled ? ' ' : '-', b.id.padEnd(28), (b.last_status || 'never').padEnd(6), (b.strategy || '').padEnd(8),
        `${b.products}/${b.with_dimensions}/${b.embedded}`.padEnd(14), b.last_error ? b.last_error.slice(0, 90) : '',
      ].join(' '));
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send([`products ${s.products.total} (dims ${s.products.with_dimensions}) across ${s.products.brands} brands`, 'en id status strategy products/dims/embedded error', ...lines].join('\n'));
    }
    return res.status(200).json({ ok: true, env: envReport(), statementsApplied, brandsSynced, ...s });
  } catch (err) {
    console.error('status failed', err);
    return res.status(500).json({ ok: false, env: envReport(), error: err.message });
  }
}
