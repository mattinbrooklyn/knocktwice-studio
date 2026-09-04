// Local check: apply the schema and brand sync against a plain Postgres.
//   DATABASE_URL=postgres://user@host:port/db npm run check:search
// Pass --no-vector for a database without the pgvector extension.
import pg from 'pg';
import { ensureSchema, syncBrands, summary } from './db.js';

const vector = !process.argv.includes('--no-vector');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = {
  query: async (text, params = []) => (await pool.query(text, params)).rows,
  batch: async (statements) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = [];
      for (const [text, params = []] of statements) out.push((await client.query(text, params)).rows);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

try {
  const applied = await ensureSchema(db, { vector });
  const brands = await syncBrands(db);
  const s = await summary(db);
  console.log(JSON.stringify({ ok: true, vector, statementsApplied: applied, brandsSynced: brands, ...s }, null, 2));
} finally {
  await pool.end();
}
