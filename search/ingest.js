// Ingest one brand: fetch its catalog, normalize, upsert, embed what changed,
// cache images, log the run. Every failure is recorded on the run row; one
// brand breaking never affects another.

import { fetchShopify } from './adapters/shopify.js';
import { fetchJsonLd } from './adapters/jsonld.js';
import { normalizeProduct } from './normalize.js';
import { toVectorLiteral } from './embeddings.js';

const EMBED_BATCH = 64;
const UPSERT_BATCH = 40;
const IMAGE_BATCH = 120;

const ADAPTERS = {
  shopify: async (http, brand, opts) => ({ products: await fetchShopify(http, brand, opts), urlsAttempted: 1 }),
  jsonld: (http, brand, opts) => fetchJsonLd(http, brand, opts),
};

function strategyOrder(brand) {
  const preferred = brand.ingest_strategy === 'custom' ? 'jsonld' : brand.ingest_strategy;
  if (brand.ingest_verified) return [preferred];
  return [preferred, ...['shopify', 'jsonld'].filter((s) => s !== preferred)];
}

/**
 * @param ctx { db, http, embed, cacheImage|null, log }
 * @param brand row from the brands table
 * @param opts { trigger: 'cron'|'manual', deadline: epoch ms }
 */
export async function ingestBrand(ctx, brandRow, { trigger = 'manual', deadline = Date.now() + 240_000 } = {}) {
  let brand = brandRow;
  const { db, http, embed, cacheImage } = ctx;
  const log = ctx.log || (() => {});
  const errors = [];
  const notes = [];
  const [run] = await db.query(
    `INSERT INTO ingest_runs (brand_id, trigger) VALUES ($1, $2) RETURNING id, started_at`,
    [brand.id, trigger],
  );
  const stats = { runId: run.id, brand: brand.id, strategy: null, urlsAttempted: 0, productsFound: 0, productsUpserted: 0, withDimensions: 0, embedded: 0, imagesCached: 0, deleted: 0 };

  try {
    // 0. Make sure the registered URL answers; fall back to the www / bare variant if not.
    const resolved = await resolveBase(http, brand.url);
    if (resolved.error) throw new Error(`site unreachable: ${resolved.error}`);
    if (resolved.url !== brand.url) {
      notes.push(`using ${resolved.url} instead of ${brand.url}`);
      brand = { ...brand, url: resolved.url };
      await db.query(`UPDATE brands SET url = $2, updated_at = now() WHERE id = $1`, [brand.id, resolved.url]);
    }

    // 1. Fetch with the first strategy that yields products.
    let raws = null;
    for (const strategy of strategyOrder(brand)) {
      if (Date.now() > deadline) break;
      try {
        log(`${brand.id}: trying ${strategy}`);
        const result = await ADAPTERS[strategy](http, brand, {
          max: brand.max_products, deadline: deadline - 60_000, log,
        });
        stats.urlsAttempted += result.urlsAttempted || 0;
        if (result.truncated) notes.push(`${strategy}: stopped at time budget`);
        if (result.blocked) notes.push(`${strategy}: ${result.blocked} URLs disallowed by robots.txt`);
        if (result.products.length > 0) {
          raws = result.products;
          stats.strategy = strategy;
          break;
        }
        errors.push({ stage: strategy, message: 'no products returned' });
      } catch (err) {
        errors.push({ stage: strategy, message: String(err.message || err).slice(0, 300) });
        log(`${brand.id}: ${strategy} failed: ${err.message}`);
      }
    }
    if (!raws) throw new Error('every strategy failed');

    // 2. Normalize and de-duplicate by source URL.
    const bySource = new Map();
    for (const raw of raws) {
      if (!raw.sourceUrl || !raw.name) continue;
      const row = normalizeProduct(raw, brand);
      if (!bySource.has(row.source_url)) bySource.set(row.source_url, row);
    }
    const rows = [...bySource.values()];
    stats.productsFound = rows.length;
    stats.withDimensions = rows.filter((r) => r.width_cm != null || r.height_cm != null || r.diameter_cm != null).length;

    // 3. Find what changed so we only embed new or edited products.
    const existing = new Map(
      (await db.query(`SELECT source_url, search_hash, (embedding IS NOT NULL) AS has_embedding, image_blob_url FROM products WHERE brand_id = $1`, [brand.id]))
        .map((r) => [r.source_url, r]),
    );
    const previousCount = existing.size;

    // 4. Upsert in batches.
    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
      const chunk = rows.slice(i, i + UPSERT_BATCH);
      await db.batch(chunk.map((r) => [UPSERT_SQL, [
        r.brand_id, r.source_url, r.external_id, r.name, r.description, r.category, r.price_cents, r.price_max_cents,
        r.currency, r.width_cm, r.depth_cm, r.height_cm, r.diameter_cm, r.dimensions_raw, r.materials, r.colors,
        r.in_stock, r.image_url, r.search_text, r.search_hash, r.vendor,
      ]]));
      stats.productsUpserted += chunk.length;
    }

    // 5. Secondary images (cheap, source URLs only; blob copies happen for the primary image).
    const ids = new Map((await db.query(`SELECT id, source_url FROM products WHERE brand_id = $1`, [brand.id])).map((r) => [r.source_url, r.id]));
    const imageStatements = [];
    for (const r of rows) {
      const pid = ids.get(r.source_url);
      if (!pid) continue;
      r.images.forEach((img, position) => {
        if (img.url) imageStatements.push([IMAGE_SQL, [pid, position, img.url, img.width ?? null, img.height ?? null]]);
      });
    }
    for (let i = 0; i < imageStatements.length; i += 100) await db.batch(imageStatements.slice(i, i + 100));

    // 6. Embeddings for new or changed products.
    const toEmbed = rows.filter((r) => {
      const prev = existing.get(r.source_url);
      return !prev || !prev.has_embedding || prev.search_hash !== r.search_hash;
    });
    for (let i = 0; i < toEmbed.length && Date.now() < deadline; i += EMBED_BATCH) {
      const chunk = toEmbed.slice(i, i + EMBED_BATCH);
      let vectors;
      try {
        vectors = await embed(chunk.map((r) => r.search_text));
      } catch (err) {
        errors.push({ stage: 'embed', message: String(err.message || err).slice(0, 300) });
        break;
      }
      await db.batch(chunk.map((r, j) => [
        `UPDATE products SET embedding = $1::vector WHERE brand_id = $2 AND source_url = $3`,
        [toVectorLiteral(vectors[j]), brand.id, r.source_url],
      ]));
      stats.embedded += chunk.length;
    }
    if (stats.embedded < toEmbed.length) notes.push(`embeddings pending for ${toEmbed.length - stats.embedded} products`);

    // 7. Cache primary images that have not been cached yet.
    if (cacheImage) {
      const pending = rows.filter((r) => r.image_url && !existing.get(r.source_url)?.image_blob_url).slice(0, IMAGE_BATCH);
      let imageErrors = 0;
      for (const r of pending) {
        if (Date.now() > deadline) { notes.push('image caching stopped at time budget'); break; }
        try {
          const blobUrl = await cacheImage(r.image_url, brand.id);
          await db.query(`UPDATE products SET image_blob_url = $1 WHERE brand_id = $2 AND source_url = $3`, [blobUrl, brand.id, r.source_url]);
          stats.imagesCached += 1;
        } catch (err) {
          imageErrors += 1;
          if (imageErrors <= 3) errors.push({ stage: 'image', url: r.image_url, message: String(err.message || err).slice(0, 200) });
        }
      }
      if (imageErrors > 3) notes.push(`${imageErrors} image errors (first 3 listed)`);
    } else {
      notes.push('image caching off (no BLOB_READ_WRITE_TOKEN)');
    }

    // 8. Retire products the site no longer lists, but only when the fetch looks complete.
    if (previousCount > 0 && rows.length >= previousCount * 0.5 && !notes.some((n) => n.includes('time budget'))) {
      const gone = await db.query(
        `DELETE FROM products WHERE brand_id = $1 AND last_seen_at < $2 RETURNING id`,
        [brand.id, run.started_at],
      );
      stats.deleted = gone.length;
    }

    // 9. Mark the strategy verified so the JSON registry stops overriding it.
    await db.query(
      `UPDATE brands SET ingest_verified = true, ingest_strategy = $2, platform = CASE WHEN $2 = 'shopify' THEN 'shopify' ELSE platform END, updated_at = now() WHERE id = $1`,
      [brand.id, stats.strategy],
    );

    await finishRun(db, run.id, 'ok', stats, errors, notes);
    log(`${brand.id}: ok ${JSON.stringify(stats)}`);
    return { ok: true, ...stats, errors, notes };
  } catch (err) {
    errors.push({ stage: 'run', message: String(err.message || err).slice(0, 300) });
    await finishRun(db, run.id, 'error', stats, errors, notes).catch(() => {});
    log(`${brand.id}: error ${err.message}`);
    return { ok: false, ...stats, errors, notes };
  }
}

/** Try the URL as registered, then with www added or removed. Returns the first that answers. */
export async function resolveBase(http, url) {
  const u = new URL(url);
  const alt = new URL(url);
  alt.hostname = u.hostname.startsWith('www.') ? u.hostname.slice(4) : `www.${u.hostname}`;
  let firstError = null;
  for (const candidate of [u, alt]) {
    try {
      const res = await http.request(candidate.toString(), { retries: 0 });
      if (res.status < 500) {
        // Follow a same-domain redirect to the canonical host (e.g. bare -> www).
        const finalUrl = res.url ? new URL(res.url) : candidate;
        const canonical = finalUrl.hostname.endsWith(u.hostname.replace(/^www\./, '')) ? `${finalUrl.protocol}//${finalUrl.hostname}` : `${candidate.protocol}//${candidate.hostname}`;
        return { url: canonical };
      }
      firstError = firstError || `HTTP ${res.status}`;
    } catch (err) {
      firstError = firstError || err.message;
    }
  }
  return { error: firstError };
}

async function finishRun(db, runId, status, stats, errors, notes) {
  await db.query(
    `UPDATE ingest_runs SET status = $2, strategy = $3, finished_at = now(), urls_attempted = $4, products_found = $5,
       products_upserted = $6, with_dimensions = $7, errors = $8::jsonb, notes = $9 WHERE id = $1`,
    [runId, status, stats.strategy, stats.urlsAttempted, stats.productsFound, stats.productsUpserted, stats.withDimensions,
      JSON.stringify(errors), notes.join(' | ') || null],
  );
}

const UPSERT_SQL = `
  INSERT INTO products (brand_id, source_url, external_id, name, description, category, price_cents, price_max_cents,
    currency, width_cm, depth_cm, height_cm, diameter_cm, dimensions_raw, materials, colors, in_stock, image_url,
    search_text, search_hash, vendor, last_seen_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, now(), now())
  ON CONFLICT (source_url) DO UPDATE SET
    external_id = EXCLUDED.external_id, name = EXCLUDED.name, description = EXCLUDED.description,
    category = EXCLUDED.category, price_cents = EXCLUDED.price_cents, price_max_cents = EXCLUDED.price_max_cents,
    currency = EXCLUDED.currency, width_cm = EXCLUDED.width_cm, depth_cm = EXCLUDED.depth_cm,
    height_cm = EXCLUDED.height_cm, diameter_cm = EXCLUDED.diameter_cm, dimensions_raw = EXCLUDED.dimensions_raw,
    materials = EXCLUDED.materials, colors = EXCLUDED.colors, in_stock = EXCLUDED.in_stock,
    image_url = EXCLUDED.image_url,
    image_blob_url = CASE WHEN products.image_url IS DISTINCT FROM EXCLUDED.image_url THEN NULL ELSE products.image_blob_url END,
    search_text = EXCLUDED.search_text, search_hash = EXCLUDED.search_hash, vendor = EXCLUDED.vendor,
    last_seen_at = now(),
    updated_at = CASE WHEN products.search_hash IS DISTINCT FROM EXCLUDED.search_hash THEN now() ELSE products.updated_at END`;

const IMAGE_SQL = `
  INSERT INTO product_images (product_id, position, source_url, width, height)
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (product_id, source_url) DO UPDATE SET position = EXCLUDED.position, width = EXCLUDED.width, height = EXCLUDED.height`;
