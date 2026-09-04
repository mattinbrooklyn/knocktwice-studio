// Local check: apply the schema and brand sync against a plain Postgres.
//   DATABASE_URL=postgres://user@host:port/db npm run check:search
// Pass --no-vector for a database without the pgvector extension.
import pg from 'pg';
import { ensureSchema, syncBrands, summary } from './db.js';

const vector = !process.argv.includes('--no-vector');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = { query: async (text, params = []) => (await pool.query(text, params)).rows };

try {
  const applied = await ensureSchema(db, { vector });
  const brands = await syncBrands(db);
  const s = await summary(db);
  console.log(JSON.stringify({ ok: true, vector, statementsApplied: applied, brandsSynced: brands, ...s }, null, 2));
} finally {
  await pool.end();
}
