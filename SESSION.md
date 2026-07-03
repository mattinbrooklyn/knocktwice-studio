# SESSION

<!-- Write this fresh before each Claude Code session. Delete or overwrite it next time. -->
<!-- Keep it tight. One goal. Be specific about what "done" looks like. -->

## Goal
Refactor the one-off "Room for Two" estimate into a **replicable, templatized system**
so a new client's shopping-cart Google Sheet can quickly become an interactive estimate
and, from it, a final approval PDF — with near-zero-touch onboarding.

Following `plans/scalable-estimate-tool.md`. Multi-step; migrate incrementally with a
byte-identical safety proof before anything reaches the live roomfortwo estimate.

The full end-to-end system includes:
- A **templated Google Sheet** (shopping cart) new clients start from — same columns
  (CATEGORY · PIECE · RETAILER · SIZE · COLOR · QTY · PRICE · LINK · STATUS · APPROVED
  · SLUG · IMAGE) as the current sheet. Ships as `templates/product-list-template.xlsx`,
  imported to Drive per client. (Built at the onboarding step, not step 1.)
- Templated estimate + final pages driven by a per-client `client.json`.
- One `ktw` CLI: `new / refresh / pdf / publish <client>`.

## Page / Component
- `estimate/sync-from-excel.py` (the generator) — becomes client-aware in step 1.
- `clients/roomfortwo/client.json` — NEW, holds every client-specific value.
- Later: `templates/estimate.html`, `templates/final.html`, `tools/ktw`,
  `templates/product-list-template.xlsx`.
- Do NOT touch `estimate/roomfortwo/*` output structure until byte-identical is proven.

## This session's scope: STEP 1 only
Introduce `clients/roomfortwo/client.json` capturing all client values, and make the
generator read it — while producing **byte-identical** `estimate/roomfortwo/` output.

## What "done" looks like (step 1)
- `clients/roomfortwo/client.json` exists with the complete config schema.
- `estimate/sync-from-excel.py roomfortwo` reads it and regenerates the pages.
- `Refresh Estimate.command` still works unchanged (default client = roomfortwo).
- **`git status --porcelain` is empty** after running the refactored generator against
  `estimate/_source/.sheet-cache.xlsx` — the byte-identical proof.

## Known constraints
- Live roomfortwo estimate must NOT change. Byte-identical is the gate.
- Byte-identical edges (decided): roomfortwo keeps `image_dir = assets/images/estimate`
  and its exact `STORAGE_KEY` (live clients have autosaved carts — don't wipe them).
- Deploy isolation: only per-client estimate + image paths reach main (git plumbing).
- Chrome print gotcha: `@page { margin: 0 }`, cream via `.wrap` padding.
- Verify PDFs with PyMuPDF (`import fitz`); `sips` only does page 1.
- Apps Script is Sheet-bound → per-client SUBMIT_URL, shared `.gs` template.

## Build order (whole project)
1. **[this session]** Extract config → `clients/roomfortwo/client.json`; generator reads it; byte-identical.
2. Templatize pages into `templates/`; generate roomfortwo from them; verify identical.
3. Build `tools/ktw` (consolidates the two `.command` scripts, parameterized by client).
4. Generalize the deploy promotion to take a client id.
5. Onboard a real second client end-to-end (+ ship the Google Sheet template) — the real test.
