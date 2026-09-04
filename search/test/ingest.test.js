// End-to-end ingest against a local Postgres with a mocked network.
//   DATABASE_URL=postgres://pgtest@localhost:5499/search_test node --test search/test/
// Skipped when DATABASE_URL is not set.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { ensureSchema, syncBrands } from '../db.js';
import { makeHttp } from '../http.js';
import { ingestBrand } from '../ingest.js';

const dir = new URL('./fixtures/', import.meta.url);
const feed = JSON.parse(readFileSync(new URL('shopify-products.json', dir), 'utf8'));
const jsonldHtml = readFileSync(new URL('jsonld-product.html', dir), 'utf8');

const url = process.env.DATABASE_URL;

test('ingestBrand end to end', { skip: !url && 'DATABASE_URL not set' }, async (t) => {
  const pool = new pg.Pool({ connectionString: url });
  const db = {
    query: async (text, params = []) => (await pool.query(text, params)).rows,
    batch: async (stmts) => { const out = []; for (const [text, params = []] of stmts) out.push((await pool.query(text, params)).rows); return out; },
  };
  t.after(() => pool.end());
  await ensureSchema(db);
  await syncBrands(db);
  await db.query(`DELETE FROM ingest_runs`);
  await db.query(`DELETE FROM products`);
  await db.query(`UPDATE brands SET ingest_verified = false`);

  let currentFeed = feed;
  const routes = (reqUrl) => {
    if (reqUrl.startsWith('https://us.hay.com/products.json')) return new Response(JSON.stringify(currentFeed), { headers: { 'content-type': 'application/json' } });
    if (reqUrl.startsWith('https://us.hay.com/products/')) return new Response('<meta property="og:price:currency" content="USD">', { headers: { 'content-type': 'text/html' } });
    if (reqUrl === 'https://us.hay.com/robots.txt') return new Response('User-agent: *\nDisallow: /cart\n');
    if (reqUrl === 'https://us.hay.com/') return new Response('<html>home</html>');
    if (reqUrl === 'https://www.muuto.com/') return new Response('<html>home</html>');
    if (reqUrl.startsWith('https://www.muuto.com/products.json')) return new Response('<html>', { status: 404 });
    if (reqUrl === 'https://www.muuto.com/sitemap.xml') return new Response('<urlset><url><loc>https://www.muuto.com/products/kink-vase</loc></url></urlset>');
    if (reqUrl === 'https://www.muuto.com/products/kink-vase') return new Response(jsonldHtml, { headers: { 'content-type': 'text/html' } });
    if (reqUrl === 'https://www.muuto.com/robots.txt') return new Response('', { status: 404 });
    if (reqUrl.includes('flos.com')) throw new TypeError('fetch failed');
    return new Response('nope', { status: 404 });
  };
  const http = makeHttp({ fetchImpl: async (u) => routes(u) });
  let embedCalls = 0;
  const embed = async (texts) => { embedCalls += texts.length; return texts.map((_, i) => Array.from({ length: 1536 }, (__, j) => (j === i ? 1 : 0))); };
  const cacheImage = async (src, brandId) => `https://blob.test/${brandId}/${src.length}.jpg`;
  const ctx = { db, http, embed, cacheImage, log: () => {} };

  const [hay] = await db.query(`SELECT * FROM brands WHERE id = 'hay'`);
  const r1 = await ingestBrand(ctx, hay, { trigger: 'manual' });
  assert.equal(r1.ok, true, JSON.stringify(r1.errors));
  assert.equal(r1.strategy, 'shopify');
  assert.equal(r1.productsFound, 3);
  assert.equal(r1.withDimensions, 3);
  assert.equal(r1.embedded, 3);
  assert.equal(r1.imagesCached, 2);
  assert.equal(embedCalls, 3);

  const rows = await db.query(`SELECT name, category, price_cents, diameter_cm, height_cm, width_cm, materials, colors, in_stock, image_blob_url, currency FROM products WHERE brand_id = 'hay' ORDER BY name`);
  const cone = rows.find((r) => r.name === 'Palissade Cone Table');
  assert.equal(cone.category, 'furniture');
  assert.equal(cone.price_cents, 44500);
  assert.equal(Number(cone.diameter_cm), 60);
  assert.equal(Number(cone.height_cm), 74);
  assert.deepEqual(cone.materials, ['steel', 'powder-coated']);
  assert.ok(cone.colors.includes('grey'));
  assert.equal(cone.in_stock, true);
  assert.match(cone.image_blob_url, /^https:\/\/blob\.test\/hay\//);
  const shade = rows.find((r) => r.name === 'Rice Paper Shade Oval');
  assert.equal(shade.category, 'lighting');
  assert.equal(Number(shade.width_cm), 44.96);
  const [{ n: imgCount }] = await db.query(`SELECT count(*)::int AS n FROM product_images`);
  assert.equal(imgCount, 2);

  // Second run: nothing changed, so no new embeddings and no image work.
  const r2 = await ingestBrand(ctx, hay, { trigger: 'cron' });
  assert.equal(r2.ok, true);
  assert.equal(r2.embedded, 0);
  assert.equal(r2.imagesCached, 0);
  assert.equal(embedCalls, 3);
  const [{ v }] = await db.query(`SELECT ingest_verified AS v FROM brands WHERE id = 'hay'`);
  assert.equal(v, true);

  // Third run: one product gone, one price changed. Gone one is deleted, changed one re-embedded.
  currentFeed = { products: [ { ...feed.products[0], variants: [{ id: 1, title: 'Anthracite', price: '499.00', available: true }] }, feed.products[1] ] };
  const r3 = await ingestBrand(ctx, hay, { trigger: 'cron' });
  assert.equal(r3.ok, true);
  assert.equal(r3.deleted, 1);
  assert.equal(r3.embedded, 0, 'price is not part of search_text, so no re-embed');
  const [{ n: remaining }] = await db.query(`SELECT count(*)::int AS n FROM products WHERE brand_id = 'hay'`);
  assert.equal(remaining, 2);
  const [{ n: imgs }] = await db.query(`SELECT count(*)::int AS n FROM product_images`);
  assert.equal(imgs, 2, 'images of deleted products cascade away');

  // JSON-LD fallback for a brand whose products.json is missing.
  const [muuto] = await db.query(`SELECT * FROM brands WHERE id = 'muuto'`);
  const r4 = await ingestBrand(ctx, muuto, { trigger: 'manual' });
  assert.equal(r4.ok, true, JSON.stringify(r4.errors));
  assert.equal(r4.strategy, 'jsonld');
  assert.equal(r4.productsFound, 1);
  const [vase] = await db.query(`SELECT * FROM products WHERE brand_id = 'muuto'`);
  assert.equal(vase.name, 'Kink Vase');
  assert.equal(Number(vase.height_cm), 30);
  assert.deepEqual([...vase.materials].sort(), ['ceramic', 'stoneware']);
  assert.deepEqual(vase.colors, ['mustard']);

  const runs = await db.query(`SELECT brand_id, status, strategy, products_found FROM ingest_runs ORDER BY id`);
  assert.equal(runs.length, 4);
  assert.ok(runs.every((r) => r.status === 'ok'));

  // A brand whose site is down logs an error run and leaves other data alone.
  const [dead] = await db.query(`SELECT * FROM brands WHERE id = 'flos'`);
  const r5 = await ingestBrand(ctx, dead, { trigger: 'cron' });
  assert.equal(r5.ok, false);
  assert.match(r5.errors[0].message, /unreachable/);
  const [{ n: total }] = await db.query(`SELECT count(*)::int AS n FROM products`);
  assert.equal(total, 3);
});
