# SESSION

<!-- Write this fresh before each Claude Code session. Delete or overwrite it next time. -->
<!-- Keep it tight. One goal. Be specific about what "done" looks like. -->

## Goal
Step 4 of the scalable estimate refactor (see plans/scalable-estimate-tool.md):
port the git-plumbing **deploy promotion** out of `Refresh Estimate.command` into
`ktw publish <client>`, parameterized by the client's paths from client.json.
Start in plan mode: read-only audit of the current promotion logic first, then plan.

## Page / Component
- `tools/ktw` — already has a deferred `publish` stub; wire it up here.
- `Refresh Estimate.command` — source of the git plumbing to port (staging push +
  live promotion via read-tree/commit-tree, hardcoded to estimate/roomfortwo +
  assets/images/estimate).
- `clients/roomfortwo/client.json` — output_dir + image_dir are the paths to parameterize.

## What "done" looks like
- `ktw publish <client>` pushes the client's paths to staging AND promotes them to
  live (main) in isolation, using the same plumbing as today but client-parameterized.
- **Dry-run verified first**: prove the tree it would push to main contains ONLY
  estimate/<client>/ + assets/images/<client>/ swapped in — never a wholesale
  staging→main merge — BEFORE any real push to main.
- Once `publish` works, update the two `.command` wrappers to call ktw (thin), and
  update memory (final-pdf-pipeline / estimate-deploy-architecture) for the new tooling.

## Known constraints
- LIVE DEPLOY. Live (main) must receive ONLY per-client estimate + image paths via
  git plumbing (read-tree/commit-tree), never a branch merge. See memory
  estimate-deploy-architecture.md. Do NOT run a real live promotion until the
  dry-run proof passes and Matt approves.
- roomfortwo's live paths are estimate/roomfortwo + assets/images/estimate (its
  image_dir is "estimate", not the client id — preserved for zero live disruption).
- Steps 1–3 are done + committed (config, templates, ktw new/refresh/pdf). Byte-identical.
- After step 4: step 5 = onboard a real 2nd client + build templates/product-list-template.xlsx
  (the shopping-cart Google Sheet template).
