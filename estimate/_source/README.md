# Editing the estimate — how the Excel drives the page

The estimate page (`estimate/index.html`) gets its line items from this
spreadsheet. The spreadsheet is the **source of truth** — don't hand-edit the
item data in the HTML; a sync would overwrite it.

## To change items or prices

1. Open **`design-package.xlsx`** and edit the **ROUND 1** sheet
   (category, piece, retailer, size, color, qty, price, link).
2. From the repo root, run:
   ```
   python3 estimate/sync-from-excel.py
   ```
   It rebuilds the page's data and prints a report — totals, plus any items
   that still need a product photo.
3. Preview the page, then commit & push to publish.

## Columns the tool reads

`CATEGORY · PIECE · RETAILER · SIZE · COLOR · QTY · PRICE · LINK · SLUG`

- **PRICE** is per-unit; the line total is computed (qty × price), so you don't
  maintain it by hand.
- **SLUG** is a short stable id that ties a row to its product photo
  (`assets/images/estimate/<slug>.webp`). Existing rows already have one. For a
  **new** row you can leave SLUG blank — the tool will make one from the piece
  name and tell you what to name the image.
- **LINK** of `N/A`, `TBD`, or blank = no "View product" link.

## Adding a new product photo

Name it `<slug>.webp` and drop it in `assets/images/estimate/`. Until it's
there, the item shows a tasteful placeholder. (Big images are fine — resize to
~600px before adding so the page stays light.)

## Publishing a new round

The round label/date lives in `index.html` near the top of the script:
```
const ROUND = { label: "Round 1", date: "April 23, 2026" };
```
Bump it when you publish a new version — it updates the header stamp, the
footer, and the label on every submission email automatically.
