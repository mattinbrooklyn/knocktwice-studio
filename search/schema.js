// Database schema for the product search tool.
//
// Every statement is idempotent (IF NOT EXISTS), so ensureSchema() can run on
// every cold start without harm. Add new statements at the end; never edit an
// existing CREATE TABLE in place once it has shipped. Use ALTER TABLE ... ADD
// COLUMN IF NOT EXISTS for changes.
//
// `vector: true` marks statements that need the pgvector extension. Local test
// databases without pgvector skip them; Neon has it.

export const EMBEDDING_DIMENSIONS = 1536; // OpenAI text-embedding-3-small

export const SCHEMA = [
  { vector: true, sql: `CREATE EXTENSION IF NOT EXISTS vector` },

  { sql: `CREATE TABLE IF NOT EXISTS brands (
    id               text PRIMARY KEY,
    name             text NOT NULL,
    url              text NOT NULL,
    hq               text,
    tier             text NOT NULL CHECK (tier IN ('core', 'expansion', 'retailer')),
    categories       text[] NOT NULL DEFAULT '{}',
    platform         text,
    ingest_strategy  text NOT NULL,
    ingest_verified  boolean NOT NULL DEFAULT false,
    max_products     integer NOT NULL DEFAULT 400,
    collections      text[],
    enabled          boolean NOT NULL DEFAULT false,
    notes            text,
    updated_at       timestamptz NOT NULL DEFAULT now()
  )` },

  { sql: `CREATE TABLE IF NOT EXISTS products (
    id               bigserial PRIMARY KEY,
    brand_id         text NOT NULL REFERENCES brands(id),
    source_url       text NOT NULL UNIQUE,
    external_id      text,
    name             text NOT NULL,
    description      text,
    category         text,
    price_cents      integer,
    price_max_cents  integer,
    currency         text NOT NULL DEFAULT 'USD',
    width_cm         numeric(8,2),
    depth_cm         numeric(8,2),
    height_cm        numeric(8,2),
    diameter_cm      numeric(8,2),
    dimensions_raw   text,
    materials        text[] NOT NULL DEFAULT '{}',
    colors           text[] NOT NULL DEFAULT '{}',
    in_stock         boolean,
    image_url        text,
    image_blob_url   text,
    search_text      text NOT NULL,
    fts              tsvector GENERATED ALWAYS AS (to_tsvector('english', search_text)) STORED,
    first_seen_at    timestamptz NOT NULL DEFAULT now(),
    last_seen_at     timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
  )` },

  { vector: true, sql: `ALTER TABLE products ADD COLUMN IF NOT EXISTS embedding vector(${EMBEDDING_DIMENSIONS})` },

  { sql: `CREATE INDEX IF NOT EXISTS products_fts_idx ON products USING gin (fts)` },
  { sql: `CREATE INDEX IF NOT EXISTS products_brand_idx ON products (brand_id)` },
  { sql: `CREATE INDEX IF NOT EXISTS products_price_idx ON products (price_cents)` },
  { sql: `CREATE INDEX IF NOT EXISTS products_category_idx ON products (category)` },
  { vector: true, sql: `CREATE INDEX IF NOT EXISTS products_embedding_idx ON products USING hnsw (embedding vector_cosine_ops)` },

  { sql: `CREATE TABLE IF NOT EXISTS product_images (
    id               bigserial PRIMARY KEY,
    product_id       bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    position         integer NOT NULL DEFAULT 0,
    source_url       text NOT NULL,
    blob_url         text,
    width            integer,
    height           integer,
    UNIQUE (product_id, source_url)
  )` },

  { sql: `CREATE TABLE IF NOT EXISTS ingest_runs (
    id                 bigserial PRIMARY KEY,
    brand_id           text REFERENCES brands(id),
    trigger            text NOT NULL CHECK (trigger IN ('cron', 'manual')),
    status             text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'error')),
    strategy           text,
    started_at         timestamptz NOT NULL DEFAULT now(),
    finished_at        timestamptz,
    urls_attempted     integer NOT NULL DEFAULT 0,
    products_found     integer NOT NULL DEFAULT 0,
    products_upserted  integer NOT NULL DEFAULT 0,
    with_dimensions    integer NOT NULL DEFAULT 0,
    errors             jsonb NOT NULL DEFAULT '[]'::jsonb,
    notes              text
  )` },
  { sql: `CREATE INDEX IF NOT EXISTS ingest_runs_brand_started_idx ON ingest_runs (brand_id, started_at DESC)` },
];
