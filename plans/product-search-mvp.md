# Plan: Interior Product Search — MVP

**Status:** Steps 1 to 4 done and exercised against the live registry. 27 brands ingest
cleanly: 5,109 products, 1,334 with dimensions, all embedded. Next: Step 5, the search API, built on
what is already in the database. Coverage of the remaining brands is deliberately
deferred until the search page shows which gaps matter.

**Brand list to approve:** [`product-search-brands.md`](product-search-brands.md)

---

## The brief, as understood

- A private, password-protected search page at `/tools/search` on knocktwice.studio.
  For Matt and Rodrigo only. Ships to staging first through the existing
  GitHub → Vercel pipeline.
- One text box. Type a plain-English description ("small rounded terracotta side
  table"), get a ranked grid of products from ~50 curated brands (expandable to
  100). Each card: image, brand + name, price, dimensions, material/color when
  known, stock when scrapable, link out. Sort by relevance / price / size. Filter
  by brand / price range / category.
- Product data is scraped weekly (and on demand) from the brands' own sites,
  stored in Neon Postgres with pgvector, searched with a hybrid of OpenAI
  embeddings and Postgres full-text. Images cached to Vercel Blob.
- Not client-facing, not a store, not visual search, not real-time, not in the nav.
- Done = Matt uses it on a real project instead of tab-juggling, and a broken
  brand site fails loudly and alone.

## Architecture decision: Option A (serverless functions in this repo)

Confirmed. Reasons: the site stays static, nothing on the existing pages changes,
and the whole feature is additive (`/tools/search/`, `/api/search/*`,
`middleware.js`, `vercel.json` cron entry). Vercel project `knocktwice-studio` is
on the Pro plan, so weekly crons and long-running functions are available.

## Things to know before build (flagged now so they don't compound)

1. **URL.** The brief says `/search` in one place and `/tools/search` elsewhere.
   Going with `/tools/search`. Note the repo already has a `tools/` folder holding
   the `ktw` CLI script; the page will live at `tools/search/index.html` and
   Vercel serves it as a static route. The `ktw` script is not web-served today
   and will be excluded explicitly so it stays that way.
2. **Password middleware on a static site.** Vercel Edge Middleware works without
   a framework (a root `middleware.js`). It will guard `/tools/search` and
   `/api/search/*` with a cookie set after a correct password. Everything else on
   the site is untouched. Password lives in a Vercel env var.
3. **Scrape fan-out.** One serverless function cannot crawl 50 sites in one
   invocation. The cron runs daily instead of weekly and refreshes the most
   stale brands until its 5-minute budget is spent, so every brand is refreshed
   at least weekly and each gets its own log row and its own failure. Vercel
   crons only run on production, so the schedule starts once this merges to
   `main`; on staging, ingest is triggered per brand by hand.
4. **Shopify shortcut.** Roughly half the proposed brands run on Shopify, which
   exposes a public `/products.json` feed with title, price, images, variants, and
   body text. That is far more reliable than HTML scraping and will be the first
   adapter. Schema.org JSON-LD is the second. Per-brand HTML adapters are the last
   resort and will be written only where the first two fail.
5. **Dimensions are the hard field.** Most sites put W × D × H in free text or
   a spec table, in inches or centimeters, sometimes both. Extraction will be
   best-effort with a normalization pass (always store cm, display inches). Expect
   gaps on the first run; the run log will report per-brand dimension coverage so
   we know where to write adapters.
6. **Big catalogs.** DWR, Vitra, and Jonathan Adler each have thousands of SKUs.
   Ingest will be capped per brand by category so the index stays on-aesthetic
   and embedding cost stays trivial.
7. **Paint and wallpaper** (Farrow & Ball, Backdrop, Clare, Hygge & West) have
   no dimensions and behave differently in results. They will be ingested with
   `category = finish` and shown with a swatch-style card.
8. **Configurable products** (USM, Vitsoe, String, Montana) are systems, not
   SKUs. They will be indexed at the product-family level with a "from" price.
9. **Scraping etiquette.** Weekly, low volume, respects `robots.txt`, identifies
   itself with a real user agent, and caches images once. Internal use only.

## Steps

1. **Brand universe proposal** — this deliverable. Matt approves or edits the list.
2. **Brand registry** — approved list as a JSON file in the repo (name, URL,
   platform, categories, ingest strategy, enabled flag).
3. **Data layer** — Neon schema (brands, products, product_images, ingest_runs),
   pgvector index, full-text index.
4. **Ingest pipeline** — Shopify adapter, JSON-LD adapter, per-brand fallback
   adapters, image caching to Blob, run logging, on-demand + weekly cron.
5. **Search API** — hybrid ranking (embedding + full-text), filters, sort.
6. **Search page** — `/tools/search`, built on the existing design system.
7. **Password middleware** and staging deploy.

Each step is its own session. Steps 2 and 3 can start as soon as the list is
approved.

## Decisions made (Sept 4, 2026)

- Brand list approved with Lucca House (luccahouse.com) and Interior Define added.
- Reference stores are a second source tier tagged `retailer`, enabled after the
  brand-site adapters work.
- One shared password, per the brief.

## Environment variables (Vercel project, Production and Preview)

| Name | Set by | Purpose |
|---|---|---|
| `DATABASE_URL` | Neon integration | Postgres connection |
| `OPENAI_API_KEY` | Matt | Embeddings |
| `SEARCH_PASSWORD` | Matt | The gate on the search page |
| `CRON_SECRET` | Matt | Lets Vercel's scheduler call the ingest cron |
| `BLOB_READ_WRITE_TOKEN` | Blob store (optional) | Image caching; without it product images hotlink the brand |

A variable saved for Production only is invisible to this branch's preview
deployments. `GET /api/search/status` reports which names are present.

## First live runs (Sept 4, 2026)

What the first sweep of the core list found. The registry notes carry the
per-brand detail; `GET /api/search/status?report=1` shows the live state.

- Roughly half the core brands are Shopify and ingest cleanly through the
  product feed in a few seconds each. Dimension coverage there depends on
  whether the brand writes sizes into the product description (PSTR: all of
  them; In Common With and Sundays: none, their specs live elsewhere on the page).
- The JSON-LD path works on real sites (Lucca House, Schoolhouse, Smeg,
  Tappan) but is slow: one request per product, so it is capped by the run
  budget and fills in over successive runs.
- Four brands changed under us before we started: Hay's US store folded into
  DWR, Poketo redirects to Pattern Brands, Areaware's store lists nothing, and
  two domains no longer resolve (Chen Chen & Kai Williams, Hasami Porcelain).
  A static list needs this kind of check on a schedule; the run log is it.
- Big European brands with country-split sites (Kartell, Muuto, Normann,
  Marimekko, Louis Poulsen, HKliving) need per-brand adapters. Their pages carry
  little or no schema.org data and their feeds are blocked or absent.
  Deferred until the search page exists and shows which gaps matter. Flos,
  Fermob, Ferm Living and DWR did come through JSON-LD once discovery read
  country sitemaps in the right order.
- Still failing after the sweep and worth a look later: Bower, Bzippy, Dims,
  Gantri, Gohar World, Heath, Hem, Interior Define, Jonathan Adler, Kalon,
  Nordic Knots, Raawii, Tom Dixon. Most answer but publish no feed and no
  schema.org Product block; a few block non-browser clients.
- Decision (Matt, Sept 4): stop expanding coverage. Ship search on the brands
  that work, use it on a real project, and add adapters only for brands that
  prove they matter. Hard brands get a "search this brand" deep link instead.

## Environment note

The Claude Code cloud environment blocks outbound requests to arbitrary domains,
so brand sites cannot be probed from a session. Platform guesses in the registry
are marked `verified: false` and get confirmed by the first ingest run on Vercel
(Step 4), which writes what it found back into the run log. If you want sessions
to be able to probe sites directly, loosen the environment's network policy.

## Repo layout for this feature

- `search/` — registry (`brands.json`), adapters, database helpers. Shared code.
- `api/search/` — Vercel serverless functions (query, ingest, cron). Location is
  fixed by Vercel.
- `tools/search/` — the static page. Location is the URL.
- `middleware.js` — password gate. Root location is fixed by Vercel.
