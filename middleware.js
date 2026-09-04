// Password gate for the product search tool (Step 7).
//
// Guards /tools/search and /api/search/* and nothing else on the site. One
// shared password (SEARCH_PASSWORD). A correct password sets a cookie that
// is an HMAC of a fixed string keyed by the password, so changing the
// password signs everyone out and nothing secret is stored in the cookie.
// Vercel's cron and the ingest batch chain pass with
// `Authorization: Bearer CRON_SECRET` on the API paths.
import { next } from '@vercel/functions';

export const config = {
  matcher: ['/tools/search', '/tools/search/:path*', '/api/search/:path*'],
};

const COOKIE = 'ktw_search';
const COOKIE_DAYS = 30;
const PAGE = '/tools/search/';

export default async function middleware(request) {
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith('/api/');
  const password = process.env.SEARCH_PASSWORD;

  if (!password) {
    return isApi
      ? json({ ok: false, error: 'SEARCH_PASSWORD is not set' }, 503)
      : html(loginPage('Search is not configured yet: SEARCH_PASSWORD is missing on Vercel.'), 503);
  }

  if (isApi && isCron(request)) return next();

  const expected = await token(password);
  if (safeEqual(cookie(request, COOKIE), expected)) return next();

  if (isApi) return json({ ok: false, error: 'unauthorized' }, 401);

  // Page: a POST is a login attempt, anything else gets the login form.
  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const attempt = String(form?.get('password') || '');
    if (attempt && safeEqual(await sha256(attempt), await sha256(password))) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: PAGE + (url.search || ''),
          'Set-Cookie': `${COOKIE}=${expected}; Path=/; Max-Age=${COOKIE_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return html(loginPage('That is not it. Try again.'), 401);
  }
  return html(loginPage(), 401);
}

function isCron(request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}

function cookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

async function token(password) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('knocktwice-search-session-v1')));
}

async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compare without leaking where the strings differ. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function html(body, status) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** The login screen: one field, one button, on the site's design system. */
function loginPage(message = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" type="image/webp" href="/assets/images/Logo_DifferentStates_03-30-26_Favicon_Eye_Blue.webp">
  <title>Search — Knock Twice</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Erica+One&family=Handjet:wght@100..900&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans&display=optional" rel="stylesheet">
  <link rel="stylesheet" href="/assets/styles.css">
  <style>
    html, body { overflow-x: hidden; background: var(--color-bg); }
    .page { min-height: 100vh; justify-content: center; padding-bottom: var(--space-xl); }
    .gate { max-width: var(--content-width); }
    .gate-kicker {
      font-family: var(--font-ui); font-size: var(--type-field); color: var(--color-caramel);
      font-variation-settings: 'ELGR' 1, 'ELSH' 2, 'wght' 400; margin-bottom: var(--space-xs);
    }
    .gate-title {
      font-family: var(--font-display); font-size: var(--type-h1); line-height: var(--leading-h1);
      font-weight: 400; color: var(--color-ink);
    }
    .gate-form { display: flex; gap: 0.625rem; margin-top: var(--space-sm); max-width: 32rem; }
    .gate-form .field { flex: 1; min-width: 0; }
    .gate-form .btn { flex: none; padding: 0 2.5rem; }
    .gate-error { margin-top: 0.75rem; }
    @media (max-width: 768px) {
      .gate-form { flex-direction: column; }
      .gate-form .btn { width: 100%; }
    }
  </style>
</head>
<body>
  <a href="/home/" class="logo">
    <svg preserveAspectRatio="none" width="100%" height="100%" overflow="visible" style="display:block;" viewBox="0 0 51.7794 99.3243" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path class="logo-eye-sclera" d="M14.8805 23.5467C22.2221 17.5293 29.5573 17.5293 36.8988 23.5467C29.5573 26.4788 22.2221 26.4788 14.8805 23.5467Z" fill="#F7F2EC"/>
      <circle id="logo-iris" cx="27.325" cy="19.055" r="6.127" fill="#32261F"/>
      <path d="M51.7794 23.6295C51.7794 15.4832 49.9456 9.50408 46.278 5.705C42.6104 1.89954 36.7524 0 28.7041 0H23.139C15.0906 0 9.21993 1.90592 5.53323 5.705C1.84653 9.51045 0 15.4832 0 23.6295C0 31.7759 1.8529 37.8315 5.56507 41.7899C7.51984 43.8807 10.0795 45.4105 13.225 46.3985L7.3734 99.3243H44.2913L38.4461 46.4495C41.6616 45.4615 44.2659 43.9125 46.2461 41.7899C49.9328 37.8315 51.7794 31.7759 51.7794 23.6295ZM14.8805 23.5467C22.2221 17.5293 29.5573 17.5293 36.8988 23.5467C29.5573 26.4788 22.2221 26.4788 14.8805 23.5467Z" fill="#378CDA"/>
    </svg>
  </a>
  <div id="page-scaler">
  <main class="page">
    <section class="gate">
      <p class="gate-kicker">Product search · studio only</p>
      <h1 class="gate-title">Knock twice.</h1>
      <form class="gate-form" method="post" action="${PAGE}">
        <input class="field" type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus required>
        <button class="btn" type="submit">Enter</button>
      </form>
      ${message ? `<p class="error-msg is-visible gate-error">${escape(message)}</p>` : ''}
    </section>
  </main>
  </div>
  <script src="/assets/scripts.js" defer></script>
</body>
</html>`;
}
