// Polite HTTP client for brand sites: identifies itself, times out, retries
// once on server errors, and honors robots.txt Disallow rules for our agent.

export const USER_AGENT = 'KnockTwiceSearch/0.1 (+https://knocktwice.studio)';
const AGENT_TOKEN = 'knocktwicesearch';

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
    this.url = url;
  }
}

export function makeHttp({ fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const robotsCache = new Map();

  async function request(url, { accept = '*/*', retries = 1 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, {
          headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'en-US,en;q=0.8' },
          redirect: 'follow',
          signal: ctrl.signal,
        });
        if (res.status >= 500 && attempt < retries) {
          lastErr = new HttpError(res.status, url);
          continue;
        }
        return res;
      } catch (err) {
        // undici hides DNS and TLS failures behind "fetch failed"; surface the cause.
        const cause = err?.cause;
        lastErr = cause ? new Error(`${err.message}: ${cause.code || cause.name || ''} ${cause.message || ''}`.trim()) : err;
        if (attempt >= retries) throw lastErr;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr;
  }

  async function text(url, opts) {
    const res = await request(url, opts);
    if (!res.ok) throw new HttpError(res.status, url);
    return res.text();
  }

  async function json(url, opts) {
    const res = await request(url, { accept: 'application/json', ...opts });
    if (!res.ok) throw new HttpError(res.status, url);
    return res.json();
  }

  /** True unless robots.txt disallows this path for us. Failures count as allowed. */
  async function allowed(url) {
    const u = new URL(url);
    let rules = robotsCache.get(u.origin);
    if (!rules) {
      rules = await loadRobots(u.origin).catch(() => []);
      robotsCache.set(u.origin, rules);
    }
    const path = u.pathname + u.search;
    return !rules.some((re) => re.test(path));
  }

  async function loadRobots(origin) {
    const res = await request(`${origin}/robots.txt`, { retries: 0 });
    if (!res.ok) return [];
    return parseRobots(await res.text());
  }

  return { request, text, json, allowed };
}

/** Returns Disallow rules (as RegExps) that apply to us: our own agent group if present, else `*`. */
export function parseRobots(body) {
  const groups = [];
  let current = null;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || current.closed) {
        current = { agents: [], disallow: [], closed: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current) {
      if (key === 'disallow' && value) current.disallow.push(value);
      current.closed = true;
    }
  }
  const mine = groups.find((g) => g.agents.some((a) => a.includes(AGENT_TOKEN)));
  const star = groups.find((g) => g.agents.includes('*'));
  const group = mine || star;
  if (!group) return [];
  return group.disallow.map((rule) => {
    const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped.endsWith('\\$') ? escaped.slice(0, -2) + '$' : escaped}`);
  });
}

/** Run `fn` over items with bounded concurrency; stops scheduling new work once `shouldStop()` is true. */
export async function mapLimit(items, limit, fn, shouldStop = () => false) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < items.length && !shouldStop()) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
