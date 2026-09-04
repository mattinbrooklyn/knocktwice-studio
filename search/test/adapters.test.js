import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shopifyToRaw, sizedShopifyImage } from '../adapters/shopify.js';
import { parseJsonLdProducts, discoverProductUrls } from '../adapters/jsonld.js';
import { parseRobots, makeHttp } from '../http.js';

const dir = new URL('./fixtures/', import.meta.url);
const shopify = JSON.parse(readFileSync(new URL('shopify-products.json', dir), 'utf8'));
const jsonldHtml = readFileSync(new URL('jsonld-product.html', dir), 'utf8');

test('shopifyToRaw maps the feed', () => {
  const raw = shopifyToRaw(shopify.products[0], 'https://us.hay.com', 'USD');
  assert.equal(raw.sourceUrl, 'https://us.hay.com/products/palissade-cone-table');
  assert.equal(raw.priceMin, 445); assert.equal(raw.inStock, true);
  assert.deepEqual(raw.tags, ['outdoor', 'table', 'Bouroullec']);
  assert.equal(raw.images[0].url, 'https://cdn.shopify.com/s/files/1/0001/palissade.jpg?v=1&width=1200');
  const raw2 = shopifyToRaw(shopify.products[1], 'https://us.hay.com');
  assert.deepEqual(raw2.tags, ['lighting', 'paper']);
  assert.deepEqual(raw2.variantTitles, []);
});

test('sizedShopifyImage leaves non-Shopify URLs alone', () => {
  assert.equal(sizedShopifyImage('https://example.com/a.jpg'), 'https://example.com/a.jpg');
});

test('parseJsonLdProducts reads a Product inside @graph', () => {
  const [raw] = parseJsonLdProducts(jsonldHtml, 'https://example-brand.test/products/kink-vase');
  assert.equal(raw.name, 'Kink Vase');
  assert.equal(raw.priceMin, 180); assert.equal(raw.currency, 'USD'); assert.equal(raw.inStock, true);
  assert.equal(raw.material, 'stoneware'); assert.equal(raw.color, 'Mustard');
  assert.equal(raw.images.length, 2);
});

test('parseRobots picks our group, else *', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /cart\nDisallow: /account/*\n\nUser-agent: Googlebot\nDisallow:\n');
  assert.equal(rules.length, 2);
  assert.ok(rules[0].test('/cart'));
  assert.ok(rules[1].test('/account/orders'));
  assert.ok(!rules[0].test('/products/x'));
  const mine = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: KnockTwiceSearch\nDisallow: /private\n');
  assert.equal(mine.length, 1);
  assert.ok(!mine[0].test('/products/x'));
});

test('discoverProductUrls follows a sitemap index and filters product paths', async () => {
  const pages = {
    'https://example-brand.test/sitemap.xml': '<sitemapindex><sitemap><loc>https://example-brand.test/sitemap_products_1.xml</loc></sitemap><sitemap><loc>https://example-brand.test/sitemap_pages_1.xml</loc></sitemap></sitemapindex>',
    'https://example-brand.test/sitemap_products_1.xml': '<urlset><url><loc>https://example-brand.test/products/kink-vase</loc></url><url><loc>https://example-brand.test/products/other</loc></url><url><loc>https://example-brand.test/collections/all</loc></url></urlset>',
    'https://example-brand.test/sitemap_pages_1.xml': '<urlset><url><loc>https://example-brand.test/pages/about</loc></url></urlset>',
  };
  const fetchImpl = async (url) => new Response(pages[url] ?? 'nope', { status: pages[url] ? 200 : 404 });
  const http = makeHttp({ fetchImpl });
  const urls = await discoverProductUrls(http, { url: 'https://example-brand.test/' }, { max: 10 });
  assert.deepEqual(urls, ['https://example-brand.test/products/kink-vase', 'https://example-brand.test/products/other']);
});
