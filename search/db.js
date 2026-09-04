// Database access for the product search tool.
//
// One interface everywhere: db.query(text, params) resolves to an array of rows.
// In Vercel functions that wraps Neon's HTTP driver. Locally (search/check.js)
// it wraps node-postgres so the same schema and queries can be tested against a
// plain Postgres.

import { neon } from '@neondatabase/serverless';
import { SCHEMA } from './schema.js';
import registry from './brands.json' with { type: 'json' };

export function connectionString() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Connect the Neon integration in the Vercel project.');
  return url;
}

/** Neon-backed db for serverless functions. */
export function getDb() {
  const sql = neon(connectionString());
  return {
    query: (text, params = []) => sql.query(text, params),
    /** Run several statements in one transaction (one HTTP round trip on Neon). */
    batch: (statements) => (statements.length ? sql.transaction(statements.map(([text, params = []]) => sql.query(text, params))) : Promise.resolve([])),
  };
}

/** Apply every schema statement. Safe to run repeatedly. */
export async function ensureSchema(db, { vector = true } = {}) {
  let applied = 0;
  for (const stmt of SCHEMA) {
    if (stmt.vector && !vector) continue;
    await db.query(stmt.sql);
    applied += 1;
  }
  return applied;
}

/** Upsert search/brands.json into the brands table. The JSON file is the source of truth. */
export async function syncBrands(db) {
  let count = 0;
  for (const b of registry.brands) {
    await db.query(
      `INSERT INTO brands (id, name, url, hq, tier, categories, platform, ingest_strategy,
         ingest_verified, max_products, collections, enabled, notes, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         url = EXCLUDED.url,
         hq = EXCLUDED.hq,
         tier = EXCLUDED.tier,
         categories = EXCLUDED.categories,
         platform = CASE WHEN brands.ingest_verified THEN brands.platform ELSE EXCLUDED.platform END,
         ingest_strategy = CASE WHEN brands.ingest_verified THEN brands.ingest_strategy ELSE EXCLUDED.ingest_strategy END,
         max_products = EXCLUDED.max_products,
         collections = EXCLUDED.collections,
         enabled = EXCLUDED.enabled,
         notes = EXCLUDED.notes,
         updated_at = now()`,
      // ingest_verified, and platform/strategy once verified, belong to the ingest run, not the JSON.
      [b.id, b.name, b.url, b.hq ?? null, b.tier, b.categories, b.platform ?? null,
       b.ingest.strategy, b.ingest.verified, b.ingest.maxProducts, b.ingest.collections ?? null,
       b.enabled, b.notes ?? null],
    );
    count += 1;
  }
  return count;
}

/** Snapshot of what is in the database, for the status endpoint and local checks. */
export async function summary(db) {
  const [brands] = await db.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE enabled)::int AS enabled FROM brands`,
  );
  const [products] = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE width_cm IS NOT NULL OR height_cm IS NOT NULL OR diameter_cm IS NOT NULL)::int AS with_dimensions,
            count(DISTINCT brand_id)::int AS brands
     FROM products`,
  );
  const runs = await db.query(
    `SELECT id, brand_id, status, trigger, strategy, started_at, finished_at, urls_attempted, products_found,
            products_upserted, with_dimensions, errors, notes
     FROM ingest_runs ORDER BY started_at DESC LIMIT 15`,
  );
  const verified = await db.query(
    `SELECT id, platform, ingest_strategy FROM brands WHERE ingest_verified ORDER BY id`,
  );
  return { brands, products, verifiedBrands: verified, recentRuns: runs };
}
