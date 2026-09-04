// schema.org JSON-LD adapter. Discovers product URLs from the sitemap, fetches
// each page, and reads the <script type="application/ld+json"> Product block.
// Slower than Shopify (one request per product), so it is bounded by both
// `max` and `deadline`.

import { mapLimit } from '../http.js';

export async function fetchJsonLd(http, brand, { max = 400, deadline = Infinity, concurrency = 4, log = () => {} } = {}) {
  const urls = await discoverProductUrls(http, brand, { max });
  if (urls.length === 0) throw new Error('no product URLs found in sitemap');
  log(`jsonld: ${urls.length} candidate URLs`);

  const raws = [];
  let fetched = 0;
  let blocked = 0;
  await mapLimit(urls, concurrency, async (url) => {
    if (!(await http.allowed(url))) {
      blocked += 1;
      return;
    }
    let html;
    try {
      html = await http.text(url, { retries: 0 });
    } catch (err) {
      log(`jsonld: skip ${url}: ${err.message}`);
      return;
    }
    fetched += 1;
    for (const raw of parseJsonLdProducts(html, url)) raws.push(raw);
  }, () => Date.now() > deadline);

  return { products: raws, urlsAttempted: fetched, blocked, truncated: Date.now() > deadline };
}

const PRODUCT_PATH = /\/(products?|shop|item|p)\//i;

export async function discoverProductUrls(http, brand, { max = 400 } = {}) {
  const base = brand.url.replace(/\/+$/, '');
  const origin = new URL(base).origin;
  const roots = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`];

  const productUrls = [];
  const seen = new Set();
  const queue = [];
  for (const root of roots) {
    try {
      queue.push(await http.text(root, { retries: 0 }));
      break;
    } catch {
      // try next root
    }
  }
  let sitemapsRead = 0;
  while (queue.length && productUrls.length < max && sitemapsRead < 30) {
    const xml = queue.shift();
    sitemapsRead += 1;
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decodeXml(m[1]));
    const isIndex = /<sitemapindex/i.test(xml);
    for (const loc of locs) {
      if (isIndex) {
        // Prefer child sitemaps that look product-related; still read others if nothing else.
        if (/product|shop|catalog/i.test(loc) || locs.length <= 5) {
          try {
            queue.push(await http.text(loc, { retries: 0 }));
          } catch {
            // ignore broken child sitemap
          }
        }
      } else if (PRODUCT_PATH.test(new URL(loc).pathname) && !seen.has(loc)) {
        seen.add(loc);
        productUrls.push(loc);
        if (productUrls.length >= max) break;
      }
    }
  }
  return productUrls;
}

function decodeXml(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

const SCRIPT_RE = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export function parseJsonLdProducts(html, pageUrl) {
  const products = [];
  for (const m of html.matchAll(SCRIPT_RE)) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    for (const node of flatten(data)) {
      if (isProduct(node)) products.push(jsonLdToRaw(node, pageUrl));
    }
  }
  return products;
}

function flatten(data) {
  if (Array.isArray(data)) return data.flatMap(flatten);
  if (data && typeof data === 'object') {
    const out = [data];
    if (Array.isArray(data['@graph'])) out.push(...data['@graph'].flatMap(flatten));
    return out;
  }
  return [];
}

function isProduct(node) {
  const t = node['@type'];
  const types = Array.isArray(t) ? t : [t];
  return types.some((x) => typeof x === 'string' && /product/i.test(x));
}

function str(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return str(v[0]);
  if (typeof v === 'object') return str(v.name ?? v['@value'] ?? v.value ?? v.url ?? '');
  return String(v);
}

function imageUrls(v) {
  if (!v) return [];
  const list = Array.isArray(v) ? v : [v];
  return list.map((x) => (typeof x === 'string' ? x : x?.url || x?.contentUrl)).filter(Boolean).map((url) => ({ url }));
}

function offers(node) {
  const o = node.offers;
  const list = Array.isArray(o) ? o : o ? [o] : [];
  const prices = [];
  let currency = null;
  let inStock = null;
  for (const offer of list) {
    for (const key of ['price', 'lowPrice', 'highPrice']) {
      const n = Number.parseFloat(String(offer[key] ?? '').replace(/[^0-9.]/g, ''));
      if (Number.isFinite(n)) prices.push(n);
    }
    if (offer.priceSpecification) {
      const ps = Array.isArray(offer.priceSpecification) ? offer.priceSpecification : [offer.priceSpecification];
      for (const p of ps) {
        const n = Number.parseFloat(p.price);
        if (Number.isFinite(n)) prices.push(n);
        currency = currency || p.priceCurrency || null;
      }
    }
    currency = currency || offer.priceCurrency || null;
    const avail = str(offer.availability);
    if (avail) {
      const ok = /InStock|LimitedAvailability|PreOrder|OnlineOnly/i.test(avail);
      inStock = inStock === null ? ok : inStock || ok;
    }
  }
  return {
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    currency: currency || 'USD',
    inStock,
  };
}

function quantity(v) {
  if (v == null) return null;
  if (typeof v === 'number' || typeof v === 'string') return String(v);
  if (typeof v === 'object') {
    const val = v.value ?? v.maxValue;
    if (val == null) return null;
    return `${val} ${v.unitCode || v.unitText || ''}`.trim();
  }
  return null;
}

export function jsonLdToRaw(node, pageUrl) {
  const dims = [];
  const w = quantity(node.width);
  const d = quantity(node.depth);
  const h = quantity(node.height);
  if (w) dims.push(`W ${w}`);
  if (d) dims.push(`D ${d}`);
  if (h) dims.push(`H ${h}`);
  const props = Array.isArray(node.additionalProperty) ? node.additionalProperty : [];
  const extra = props.map((p) => `${str(p.name)}: ${str(p.value)}`).filter((s) => s !== ': ');

  return {
    sourceUrl: str(node.url) || pageUrl,
    externalId: str(node.sku) || str(node.productID) || null,
    name: str(node.name),
    descriptionHtml: str(node.description),
    productType: str(node.category),
    tags: [],
    vendor: str(node.brand),
    ...offers(node),
    images: imageUrls(node.image),
    options: [],
    variantTitles: [],
    material: str(node.material),
    color: str(node.color),
    dimensionHints: [...dims, ...extra],
  };
}
