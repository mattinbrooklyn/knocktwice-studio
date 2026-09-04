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
