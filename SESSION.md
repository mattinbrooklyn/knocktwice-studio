# SESSION

<!-- Write this fresh before each Claude Code session. Delete or overwrite it next time. -->
<!-- Keep it tight. One goal. Be specific about what "done" looks like. -->

## Goal
Product search, Steps 5 to 7: get the tool testable end to end on the branch preview.
Search API, search page at /tools/search, password gate. Nothing else.

Read first: plans/product-search-mvp.md (the whole plan and every decision so far),
search/README.md (what exists), plans/product-search-brands.md (the list).

## What exists (do not rebuild)
- Branch `claude/interior-product-search-mvp-dzqppj`, auto-deployed to the preview
  `knocktwice-studio-git-claude-in-8fe030-mattinbrooklyns-projects.vercel.app`.
- Neon database with 5,109 products across 27 brands, all embedded
  (text-embedding-3-small, pgvector), full-text column `fts`, prices in cents,
  dimensions in cm, `vendor` for the maker when it differs from the source site.
- `GET /api/search/status` (`?report=1` for a compact per-brand view),
  `GET /api/search/ingest?brand=<id>|batch|embed`, `GET /api/search/probe`.
- Env vars on Vercel for Production and Preview: DATABASE_URL, OPENAI_API_KEY,
  SEARCH_PASSWORD, CRON_SECRET. No Blob store (images hotlink the brand for now).

## Build, in this order
1. `api/search/query.js`: hybrid search. Embed the query, combine cosine
   similarity with full-text rank, filters for brand, category, price range,
   in-stock; sort by relevance, price asc/desc, size (width, then height).
   Return 48 per page with the fields the card needs. Fall back to full-text
   only if OpenAI is down, and say so in the response.
2. `tools/search/index.html`: the page. Knock Twice design system from
   assets/styles.css, variables only, no hardcoded values. Search box, filter
   row, result grid. Card: image, maker + name, price, W x D x H in inches,
   material and color chips when present, stock, link to source. Empty and
   error states. Desktop first at 1440, then fluid.
3. `middleware.js` at repo root: password gate on /tools/search and
   /api/search/* using SEARCH_PASSWORD, cookie after login, and let
   `Authorization: Bearer CRON_SECRET` through for the cron. Keep
   /api/search/status readable with the cookie only.
4. Hard brands: for enabled brands with zero products, show a "search <brand>
   for this" link row under the results that opens the brand site with the query.

## What "done" looks like
- Matt opens the preview URL /tools/search, enters the password, types
  "small rounded terracotta side table", and gets a ranked grid in under two
  seconds, with filters and sorts that work.
- The rest of the site is untouched and still serves.
- Each step is a separate commit with a message that says what changed.

## Known constraints
- Do NOT touch `main`. Do not merge to `staging` or `rebuild` this session.
- One session, one goal: no new adapters, no new brands, no image caching.
- The Claude Code environment cannot reach brand sites or the preview via curl;
  verify through the Vercel connection's URL fetch, as the last session did.
- If something is unclear, state the assumption and keep building.
