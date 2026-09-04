# search/

Shared code and data for the interior product search tool (see
`plans/product-search-mvp.md`). Nothing in here is served as a page; the page
lives at `tools/search/`, the serverless functions at `api/search/`.

- `brands.json` — the brand registry. This is the source of truth for what gets
  scraped. Edit it by hand; `brands.schema.json` describes every field.
- `brands.schema.json` — JSON Schema for the registry.

Rules for `brands.json`:

- `id` never changes once a brand has products in the database. It is the
  foreign key.
- Only `enabled: true` brands are ingested. Core brands start enabled, expansion
  and retailer brands start disabled. Flip the flag to add a brand; do not delete
  rows (disable them instead) so old products can be cleaned up by id.
- `platform` and `ingest.strategy` are guesses until `ingest.verified` is true.
  The first ingest run tries Shopify's feed, then schema.org JSON-LD, and records
  which one worked.
- `ingest.maxProducts` caps big catalogs. Lower it, or set `ingest.collections`,
  for brands that flood results with off-aesthetic stock.

## Ingest pipeline

- `ingest.js` — `ingestBrand(ctx, brand, opts)`: fetch, normalize, upsert, embed
  what changed, cache images, log the run. One brand per call; failures land on
  the `ingest_runs` row and never touch other brands.
- `adapters/shopify.js` — reads `/products.json` (250 per page). Used first for
  every unverified brand because it is the most reliable source.
- `adapters/jsonld.js` — sitemap discovery plus schema.org Product blocks. The
  fallback for everything that is not Shopify.
- `normalize.js` — HTML stripping, dimension parsing (stored in cm), material
  and color vocab, category rules, and the `search_text` that feeds both the
  embedding and the full-text index.
- `embeddings.js` — OpenAI `text-embedding-3-small`, 1536 dimensions.
- `images.js` — copies the primary image to Vercel Blob when
  `BLOB_READ_WRITE_TOKEN` exists; otherwise the brand's own image URL is used.
- `http.js` — polite fetch: identifies as `KnockTwiceSearch`, 15 s timeout, one
  retry on server errors, honors `robots.txt` Disallow rules.

Endpoints:

- `GET /api/search/query?q=<text>` — hybrid search: embedding rank fused with
  full-text rank (reciprocal rank fusion), filters `brand` (comma list),
  `category`, `min`/`max` (USD), `stock=1`; `sort` = relevance | price_asc |
  price_desc | size; `page` (48 per page). `mode` in the response is `hybrid`,
  or `fulltext` with `fallbackReason` when the embedding call failed.
  `?meta=1` returns enabled brands with counts, categories, and price bounds.
- `GET /api/search/status` — applies schema, syncs registry, reports counts,
  verified brands, and the last 15 runs.
- `GET /api/search/ingest?brand=<id>` — runs one brand now. Trusted when called
  with the cron secret; otherwise throttled to one run per brand per 30 minutes.
- `GET /api/search/cron` — daily at 06:00 UTC on production, refreshes the most
  stale enabled brands within a 5-minute budget. Needs `CRON_SECRET`.

Tests: `npm test` runs unit tests; set `DATABASE_URL` to a local Postgres with
pgvector to include the end-to-end ingest test.
