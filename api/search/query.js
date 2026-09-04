// GET /api/search/query?q=<text>&brand=a,b&category=x&min=<usd>&max=<usd>&stock=1&sort=relevance|price_asc|price_desc|size&page=1
// Hybrid search over the products table: the query is embedded and ranked by
// cosine distance, ranked again by Postgres full-text, and the two orderings
// are fused (reciprocal rank fusion). Filters apply before ranking. If the
// embedding call fails the response says `mode: "fulltext"` and ranks by
// full-text alone, so a bad OpenAI day degrades instead of breaking.
//
// GET /api/search/query?meta=1 returns what the page needs before the first
// search: enabled brands with product counts, categories, price bounds.
import { getDb } from '../../search/db.js';
import { makeEmbedder, toVectorLiteral } from '../../search/embeddings.js';

const PER_PAGE = 48;
const VECTOR_CANDIDATES = 150; // top-N by embedding that always make the result set
const RRF_K = 60;
const EMBED_TIMEOUT_MS = 6000;
const MAX_QUERY_CHARS = 300;

const SORTS = {
  relevance: 'c.score DESC, p.id',
  price_asc: 'p.price_cents ASC NULLS LAST, c.score DESC, p.id',
  price_desc: 'p.price_cents DESC NULLS LAST, c.score DESC, p.id',
  // "Size" reads width first (diameter stands in for round pieces), then height.
  size: 'COALESCE(p.width_cm, p.diameter_cm) ASC NULLS LAST, p.height_cm ASC NULLS LAST, c.score DESC, p.id',
};

const CARD_COLUMNS = `p.id, p.brand_id, b.name AS brand_name, p.vendor, p.name, p.category,
  p.price_cents, p.price_max_cents, p.currency, p.width_cm, p.depth_cm, p.height_cm, p.diameter_cm,
  p.materials, p.colors, p.in_stock, COALESCE(p.image_blob_url, p.image_url) AS image_url, p.source_url`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'GET only' });
  }
  const started = Date.now();
  let db;
  try {
    db = getDb();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }

  try {
    if (req.query?.meta) return res.status(200).json({ ok: true, ...(await meta(db)), elapsedMs: Date.now() - started });
    const params = readParams(req.query || {});
    const result = await search(db, params);
    return res.status(200).json({ ok: true, ...params, ...result, elapsedMs: Date.now() - started });
  } catch (err) {
    console.error('query failed', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

function readParams(query) {
  const q = String(query.q || '').trim().slice(0, MAX_QUERY_CHARS);
  const brands = String(query.brand || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
  const category = String(query.category || '').trim() || null;
  const usd = (v) => (v === undefined || v === '' ? null : Math.max(0, Number.parseFloat(v)) || null);
  const min = usd(query.min);
  const max = usd(query.max);
  const inStock = ['1', 'true', 'yes'].includes(String(query.stock || '').toLowerCase());
  const sort = SORTS[query.sort] ? String(query.sort) : 'relevance';
  const page = Math.max(1, Math.min(200, Number.parseInt(query.page, 10) || 1));
  return { q, brands, category, min, max, inStock, sort, page };
}

/** WHERE clause + params for the filter row. Filters run before ranking, so they never hide good matches. */
function filterSql(params, args) {
  const where = ['TRUE'];
  if (params.brands.length) { args.push(params.brands); where.push(`p.brand_id = ANY($${args.length}::text[])`); }
  if (params.category) { args.push(params.category); where.push(`p.category = $${args.length}`); }
  if (params.min != null) { args.push(Math.round(params.min * 100)); where.push(`p.price_cents >= $${args.length}`); }
  if (params.max != null) { args.push(Math.round(params.max * 100)); where.push(`p.price_cents <= $${args.length}`); }
  if (params.inStock) where.push(`p.in_stock IS TRUE`);
  return where.join(' AND ');
}

/** Try to embed the query; on any failure report why and let the caller fall back to full-text. */
async function embedQuery(q) {
  try {
    const embed = makeEmbedder({ fetchImpl: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(EMBED_TIMEOUT_MS) }) });
    const [vector] = await embed([q]);
    return { vector, error: null };
  } catch (err) {
    console.error('embedding failed, falling back to full-text', err);
    return { vector: null, error: String(err?.message || err).slice(0, 200) };
  }
}

/** "a or b or c" so a query still matches when only some words appear; the AND form boosts full matches. */
function orQuery(q) {
  return q.replace(/["()]/g, ' ').split(/\s+/).filter(Boolean).join(' or ');
}

async function search(db, params) {
  const args = [];
  const where = filterSql(params, args);
  let mode = 'browse';
  let fallbackReason = null;
  let candidates;

  if (params.q) {
    const { vector, error } = await embedQuery(params.q);
    args.push(params.q, orQuery(params.q));
    const andIdx = args.length - 1;
    const orIdx = args.length;
    if (vector) {
      mode = 'hybrid';
      args.push(toVectorLiteral(vector), VECTOR_CANDIDATES);
      const vecIdx = args.length - 1;
      const topIdx = args.length;
      // Exact cosine scan over the filtered rows (a window function, so the
      // planner cannot swap in the approximate HNSW index and drop filtered
      // matches). Cheap at this catalog size.
      candidates = `
        scored AS (
          SELECT p.id,
            row_number() OVER (ORDER BY p.embedding <=> $${vecIdx}::vector NULLS LAST) AS vec_rank,
            (p.fts @@ websearch_to_tsquery('english', $${orIdx})) AS txt_hit,
            ts_rank_cd(p.fts, websearch_to_tsquery('english', $${orIdx}))
              + CASE WHEN p.fts @@ websearch_to_tsquery('english', $${andIdx}) THEN 1 ELSE 0 END AS txt_score
          FROM products p WHERE ${where}
        ),
        ranked AS (
          SELECT id, vec_rank,
            CASE WHEN txt_hit THEN row_number() OVER (PARTITION BY txt_hit ORDER BY txt_score DESC, id) END AS txt_rank
          FROM scored
        ),
        c AS (
          SELECT id, 1.0 / (${RRF_K} + vec_rank) + COALESCE(1.0 / (${RRF_K} + txt_rank), 0) AS score
          FROM ranked WHERE vec_rank <= $${topIdx} OR txt_rank IS NOT NULL
        )`;
    } else {
      mode = 'fulltext';
      fallbackReason = error;
      candidates = `
        c AS (
          SELECT p.id,
            ts_rank_cd(p.fts, websearch_to_tsquery('english', $${orIdx}))
              + CASE WHEN p.fts @@ websearch_to_tsquery('english', $${andIdx}) THEN 1 ELSE 0 END AS score
          FROM products p
          WHERE ${where} AND p.fts @@ websearch_to_tsquery('english', $${orIdx})
        )`;
    }
  } else {
    // No query: the filters alone define the set. Relevance means "recently seen".
    candidates = `c AS (SELECT p.id, 0::numeric AS score FROM products p WHERE ${where})`;
  }

  const order = params.q ? SORTS[params.sort] : SORTS[params.sort].replace('c.score DESC', 'p.last_seen_at DESC');
  args.push(PER_PAGE, (params.page - 1) * PER_PAGE);
  const rowsSql = `WITH ${candidates}
    SELECT ${CARD_COLUMNS}, c.score, (count(*) OVER ())::int AS total
    FROM c JOIN products p ON p.id = c.id JOIN brands b ON b.id = p.brand_id
    ORDER BY ${order} LIMIT $${args.length - 1} OFFSET $${args.length}`;
  const facetsSql = `WITH ${candidates}
    SELECT
      (SELECT json_agg(x) FROM (SELECT p.brand_id AS id, b.name, count(*)::int AS count
         FROM c JOIN products p ON p.id = c.id JOIN brands b ON b.id = p.brand_id GROUP BY 1, 2 ORDER BY 3 DESC, 2) x) AS brands,
      (SELECT json_agg(x) FROM (SELECT p.category AS id, count(*)::int AS count
         FROM c JOIN products p ON p.id = c.id WHERE p.category IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1) x) AS categories`;

  // The facets statement does not use the LIMIT/OFFSET params, and Postgres refuses unreferenced ones.
  const [rows, [facets]] = await db.batch([[rowsSql, args], [facetsSql, args.slice(0, -2)]]);
  const total = rows[0]?.total ?? 0;
  return {
    mode,
    fallbackReason,
    perPage: PER_PAGE,
    total,
    pages: Math.max(1, Math.ceil(total / PER_PAGE)),
    results: rows.map(({ total: _t, ...r }) => r),
    facets: { brands: facets?.brands || [], categories: facets?.categories || [] },
  };
}

/** Everything the page needs before the first search. */
async function meta(db) {
  const brands = await db.query(
    `SELECT b.id, b.name, b.url, b.tier, (SELECT count(*)::int FROM products p WHERE p.brand_id = b.id) AS products
     FROM brands b WHERE b.enabled ORDER BY b.name`,
  );
  const categories = await db.query(
    `SELECT category AS id, count(*)::int AS count FROM products WHERE category IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1`,
  );
  const [price] = await db.query(
    `SELECT min(price_cents)::int AS min_cents, max(price_cents)::int AS max_cents, count(*)::int AS products FROM products`,
  );
  return { brands, categories, price };
}
