# Plan: Scalable Client Estimate/Final Tool

**Status:** Not started — this is the brief for a fresh session.
**How to use this:** Open a new Claude Code session, start in **plan mode**, read
`CLAUDE.md` + this file, do a read-only audit, then produce a step plan and get
approval before editing anything. This is a multi-file refactor — plan first.

---

## North star

Turn the one-off "Room for Two" estimate into a **replicable system** for running
the same client flow (interactive estimate → client submits picks → final
selections PDF) for any client, with near-zero-touch onboarding of a new one.

**Non-goals (for now):** no framework, no web admin UI, no database. Stay a static
site + Python generator + Google Sheet. Matt's stack prefs: vanilla, minimal, no
heavy deps. Don't rebuild what works — reorganize it so it scales.

## Decisions already made (don't re-litigate)

- **Interface:** one repo CLI, `ktw`, with a few optional double-click wrappers.
  Subcommands: `ktw new <client>`, `ktw refresh <client>`, `ktw pdf <client>`,
  `ktw publish <client>`. Lives in `tools/` — organized, versioned, off the Desktop.
- **Approach:** config-driven static generator (not an app).
- **Migration:** incremental. First refactor roomfortwo to the new structure while
  producing **byte-identical output** (prove nothing broke), THEN onboard a real
  second client as the true test of replicability. No big-bang rewrite.

## Current state (what exists today)

- `estimate/roomfortwo/index.html` — interactive estimate (client picks add-to-cart /
  request-alt / don't-need; autosave; submits to Apps Script).
- `estimate/roomfortwo/final/index.html` — static, print-first Final Selections page;
  rendered to PDF by headless Chrome. See memory `final-pdf-pipeline.md`.
- `estimate/sync-from-excel.py` — reads the Sheet `PRODUCT LIST` tab → injects the
  `CART` data block into BOTH pages (estimate = STATUS=Show, final = APPROVED=Yes),
  shared image download.
- `Refresh Estimate.command`, `Make Final PDF.command` — double-click scripts in repo root.
- Google Apps Script `estimate/_source/Responses.gs` — receives submissions.
- Deploy: staging = preview; **live (main) gets ONLY `estimate/roomfortwo/` +
  `assets/images/estimate/`, promoted in isolation via git plumbing** (never merge
  staging→main wholesale). See memory `estimate-deploy-architecture.md`.

## The core problem

Template, client data, and commands are **fused inside `estimate/roomfortwo/`**.
Client-specific values are hardcoded across the HTML and the Python:
- Client/eyebrow name ("Hannah Rich"), project ("Room for Two — Hannah & Eugene"),
  title ("A Room for Two"), lede ("Ambrose & Gigi's room"), prepared date, round
  label/date, footer text.
- `SUBMIT_URL` (Apps Script), `GOOGLE_SHEET` URL, `STORAGE_KEY`, `CONTACT_EMAIL`.
- `CATEGORY_ORDER` / `LAST_CATEGORIES` in the generator (may be per-client).

## Target architecture

```
clients/
  roomfortwo/client.json      # all client-specific values (see list above)
  <next-client>/client.json
templates/
  estimate.html               # design, with {{placeholders}} for client bits + data markers
  final.html
tools/
  build.py                    # reads client.json + its Sheet → writes estimate/<client>/*
  ktw                         # CLI dispatcher: new / refresh / pdf / publish <client>
  launchers/                  # optional double-click .command wrappers per client/action
estimate/<client>/            # GENERATED output — never hand-edited
  index.html
  final/index.html
assets/images/<client>/       # per-client photos (keep isolation-friendly)
```

Key moves:
1. **Extract client config.** Move every hardcoded client value into `client.json`.
   The generator injects them the same way it already injects `CART`.
2. **Templatize the two pages.** `templates/estimate.html` + `templates/final.html`
   with placeholders. roomfortwo's current HTML becomes the template (minus specifics).
3. **Generalize the generator.** `build.py <client>` (rename/extend sync-from-excel.py).
   Reads `clients/<client>/client.json`, pulls its Sheet, writes `estimate/<client>/`.
4. **One CLI + wrappers.** `ktw` dispatches to build/pdf/publish/new. Wrappers optional.
5. **Generalize the deploy promotion.** The live-in-isolation plumbing must promote
   `estimate/<client>/` + `assets/images/<client>/` per client (parameterize the
   current hardcoded paths).
6. **`ktw new <client>`** scaffolds the folder + `client.json` stub.

## Migration steps (suggested order)

1. **Audit + plan** (read-only). Enumerate every hardcoded client value across the
   HTML and Python. Confirm the config schema.
2. **Introduce `clients/roomfortwo/client.json`** and make the generator read it —
   but keep output **byte-identical** to current `estimate/roomfortwo/`. Verify with
   a diff against git HEAD. This is the safety proof.
3. **Templatize** the pages into `templates/`, generate roomfortwo from them, diff again.
4. **Build `tools/ktw`** consolidating the two `.command` scripts, parameterized by client.
5. **Generalize the deploy promotion** to take a client id.
6. **Onboard a second client** end-to-end as the real test. Only then is it "scalable."

## Safety / constraints

- **Never touch the live roomfortwo estimate** until the refactor proves byte-identical
  output. Staging first; promote to live only when verified.
- Keep the isolation-promotion discipline (only per-client estimate paths reach main).
- **Chrome print gotcha** (see memory `final-pdf-pipeline.md`): `@page { margin: 0 }`,
  cream via `.wrap` padding — Chrome paints @page margins white.
- Verify PDFs locally with PyMuPDF (`import fitz`); `sips` only does page 1.

## Open decisions for the planning phase

- Templating mechanism: plain `str.replace`/`{{tokens}}` (stdlib, matches ethos) vs a
  tiny template lib. Recommend stdlib.
- Per-client vs shared: category order, submit URL, Apps Script (one script for all
  clients writing to different Sheets, or one per client?).
- Image dir per client (`assets/images/<client>/`) vs shared — affects deploy isolation.
- Whether the Apps Script / Sheet setup can also be scaffolded by `ktw new`.
