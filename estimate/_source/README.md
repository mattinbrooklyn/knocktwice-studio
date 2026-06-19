# Editing the estimate — the Google Sheet drives the page

The estimate page (`estimate/roomfortwo/index.html`) gets its line items from a **Google
Sheet** (the source of truth). You edit the Sheet, click **Refresh Estimate**,
and the latest data is rebuilt into the page and published.

Nothing reaches the client until you refresh — it's your deliberate publish
step, so they never see edits mid-stream.

## To change items or prices

1. Edit the **Google Sheet** (the `ROUND 1` tab).
2. Double-click **`Refresh Estimate.command`** (in the project's top folder).
   It pulls the Sheet, rebuilds the page, prints a report, and pushes to staging.
3. Give Vercel a minute, then check the staging page.

## Columns the tool reads

`CATEGORY · PIECE · RETAILER · SIZE · COLOR · QTY · PRICE · LINK`  (SLUG optional)

- **PRICE** is per-unit; the line total is computed (qty × price).
- **LINK** of `N/A`, `TBD`, or blank = no "View product" link.
- Two items with the same PIECE name in a category are auto-distinguished by
  size or color (e.g. "Crates — Medium" / "Crates — Small").

### Product photos & slugs

Each item's photo is matched by a **slug** — a short id auto-made from the piece
name (e.g. "Yellow Swivel Sconce" → `yellow-swivel-sconce`). The photo lives at
`assets/images/estimate/<slug>.webp`. After a refresh, the tool lists any items
missing a photo and tells you the exact filename to use.

⚠️ **If you rename an item in the Sheet, its slug changes** — so its photo needs
to be renamed too (the refresh report will show the new name). To avoid that, you
can add an optional **SLUG** column to the Sheet with a fixed id per row; when
present it always wins, so you can rename the display name freely. (Not required —
just handy if you rename things a lot.)

## Category order

`Labor & Install` is pinned to the bottom of the list. To pin others, edit
`LAST_CATEGORIES` near the top of `estimate/sync-from-excel.py`.

## Publishing a new round

The round label/date lives in `index.html` (the `ROUND` constant). Bump it when
you publish a new version — it updates the header stamp, footer, and the label
on every submission email.

## Adding a product photo

Name it `<slug>.webp` and drop it in `assets/images/estimate/`. Resize to ~600px
first so the page stays light.

---

### Setup / falling back to a local file

The Google Sheet link is stored once in `estimate/sync-from-excel.py`
(`GOOGLE_SHEET = "..."`). If it's left blank, the tool reads the local
`design-package.xlsx` in this folder instead. You can also run the tool by hand:
`python3 estimate/sync-from-excel.py` (reads the configured source) or
`python3 estimate/sync-from-excel.py "<sheet-url-or-file>"` (one-off override).
