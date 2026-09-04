// Shopify adapter. Every Shopify store publishes /products.json (250 per page),
// which carries title, body, type, tags, variants with prices and availability,
// and images. Currency is not in the feed, so we sniff it from one product page.

export async function fetchShopify(http, brand, { max = 400, deadline = Infinity } = {}) {
  const base = brand.url.replace(/\/+$/, '');
  const sources = brand.collections?.length
    ? brand.collections.map((c) => `${base}/collections/${c}/products.json`)
    : [`${base}/products.json`];

  const products = [];
  const seen = new Set();
  for (const src of sources) {
    for (let page = 1; page <= 20 && products.length < max && Date.now() < deadline; page += 1) {
      const data = await http.json(`${src}?limit=250&page=${page}`);
      if (!data || !Array.isArray(data.products)) throw new Error('response is not a Shopify products.json');
      if (data.products.length === 0) break;
      for (const p of data.products) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          products.push(p);
        }
      }
      if (data.products.length < 250) break;
    }
  }

  const currency = products.length ? await sniffCurrency(http, base, products[0]) : 'USD';
  return products.slice(0, max).map((p) => shopifyToRaw(p, base, currency));
}

async function sniffCurrency(http, base, product) {
  try {
    const html = await http.text(`${base}/products/${product.handle}`, { retries: 0 });
    const m = html.match(/["']currency["']\s*:\s*["']([A-Z]{3})["']/) || html.match(/og:price:currency["'][^>]*content=["']([A-Z]{3})/);
    if (m) return m[1];
  } catch {
    // Fall through to the default.
  }
  return 'USD';
}

export function shopifyToRaw(p, base, currency = 'USD') {
  const variants = Array.isArray(p.variants) ? p.variants : [];
  const prices = variants.map((v) => Number.parseFloat(v.price)).filter((n) => Number.isFinite(n));
  const tags = Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    sourceUrl: `${base}/products/${p.handle}`,
    externalId: String(p.id),
    name: p.title || '',
    descriptionHtml: p.body_html || '',
    productType: p.product_type || '',
    tags,
    vendor: p.vendor || '',
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    currency,
    inStock: variants.length ? variants.some((v) => v.available === true) : null,
    images: (Array.isArray(p.images) ? p.images : []).map((img) => ({
      url: sizedShopifyImage(img.src),
      width: img.width,
      height: img.height,
    })),
    options: (Array.isArray(p.options) ? p.options : []).map((o) => ({ name: o.name, values: o.values || [] })),
    variantTitles: variants.map((v) => v.title).filter((t) => t && t !== 'Default Title'),
  };
}

/** Ask Shopify's CDN for a 1200px-wide rendition instead of the multi-megabyte original. */
export function sizedShopifyImage(src) {
  if (!src) return null;
  try {
    const u = new URL(src);
    if (u.hostname.endsWith('shopify.com')) {
      u.searchParams.set('width', '1200');
      return u.toString();
    }
  } catch {
    // Non-URL string; return as-is.
  }
  return src;
}
