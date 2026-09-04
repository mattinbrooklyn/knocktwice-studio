// GET /api/search/probe?brand=<id>&path=/products.json
// Fetches one URL on a registered brand's site from Vercel and reports what
// came back, so adapter problems can be diagnosed without a local network.
// Only paths on the brand's own origin are allowed.
import registry from '../../search/brands.json' with { type: 'json' };
import { makeHttp } from '../../search/http.js';

function registrableDomain(host) {
  const parts = host.toLowerCase().split('.');
  // Good enough for brand sites: last two labels, or three for .co.uk / .com.au style hosts.
  const n = parts.length >= 3 && /^(co|com|org|net)$/.test(parts[parts.length - 2]) ? 3 : 2;
  return parts.slice(-n).join('.');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const brand = registry.brands.find((b) => b.id === String(req.query?.brand || ''));
  if (!brand) return res.status(404).json({ ok: false, error: 'unknown brand' });
  let url;
  if (req.query?.url) {
    // A full URL is allowed only on the brand's own domain (www or bare, any subdomain).
    let target;
    try { target = new URL(String(req.query.url)); } catch { return res.status(400).json({ ok: false, error: 'bad url' }); }
    if (registrableDomain(target.hostname) !== registrableDomain(new URL(brand.url).hostname)) {
      return res.status(400).json({ ok: false, error: `url must be on ${registrableDomain(new URL(brand.url).hostname)}` });
    }
    url = target.toString();
  } else {
    const path = String(req.query?.path || '/');
    if (!path.startsWith('/')) return res.status(400).json({ ok: false, error: 'path must start with /' });
    url = new URL(path, brand.url).toString();
  }

  const http = makeHttp();
  const started = Date.now();
  try {
    const r = await http.request(url, { retries: 0 });
    const body = await r.text();
    const locs = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
    return res.status(200).json({
      ok: true, url, finalUrl: r.url, status: r.status, ms: Date.now() - started,
      contentType: r.headers.get('content-type'), server: r.headers.get('server'), length: body.length,
      locCount: locs.length, locSample: locs.slice(0, 8),
      jsonLd: (body.match(/application\/ld\+json/g) || []).length,
      productLinks: [...new Set([...body.matchAll(/href=["']([^"']*\/products\/[^"'?#]+)/g)].map((m) => m[1]))].slice(0, 10),
      productLinkCount: new Set([...body.matchAll(/href=["']([^"']*\/products\/[^"'?#]+)/g)].map((m) => m[1])).size,
      generator: (body.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i) || [])[1] || null,
      bodyStart: body.slice(0, Math.min(20000, Number(req.query?.bytes) || 600)),
    });
  } catch (err) {
    return res.status(200).json({ ok: false, url, ms: Date.now() - started, error: err.message });
  }
}
