# Knock Twice Studio Site Guide

Use this guide to make small site updates, check them on staging, and move them live.

This site uses plain HTML, CSS, and JavaScript. GitHub stores the files. Vercel deploys the site.

There is no CMS right now. Copy edits and image swaps happen in the code files.

## Main Rule

Do not work on `main`.

`main` is the live site. Make changes on `staging` first. Check the staging site. Then merge to `main` when the change looks right.

This repo has both `origin/staging` and `origin/rebuild`. This guide uses `staging` because this checkout tracks `origin/staging`. If Vercel moves to another staging branch, update this guide too.

## Before You Edit

Run this from the repo root:

```bash
git status --short --branch
```

You want to see:

```bash
## staging...origin/staging
```

If you see `main`, stop and switch branches:

```bash
git switch staging
git pull origin staging
```

## Push To Staging

After you make and check a change:

```bash
git status --short
git add path/to/changed-file.html path/to/new-image.webp
git commit -m "Update contact page copy"
git push origin staging
```

Vercel should deploy the staging site after the push. Check the staging URL before you go live.

## Go Live

Use this process:

1. Make the change on `staging`.
2. Push `staging`.
3. Check the Vercel staging site on desktop and phone size.
4. Open a GitHub pull request from `staging` into `main`.
5. Merge only after staging looks right.

Avoid direct merges into `main` from the terminal. A pull request gives you a clear review point.

## Preview Locally

Run this from the repo root:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Useful local pages:

```text
http://localhost:8000/
http://localhost:8000/home/
http://localhost:8000/about/
http://localhost:8000/interiors/
http://localhost:8000/experiences/
http://localhost:8000/shop/
http://localhost:8000/contact/
```

Check desktop first. Then check phone size. The site uses animation, scaling, and mobile rules, so test the page at more than one width.

## File Map

Root files:

- `index.html` is the entry page.
- `vercel.json` controls redirects from old URLs to clean URLs.
- `AGENTS.md` gives Codex the project rules.
- `CLAUDE.md` is the older Claude Code instruction file.
- `SESSION.md` holds the goal for one work session.
- `PAGE-SKELETON.md` documents the shared page pattern.

Page folders:

- `home/index.html` is the home page.
- `about/index.html` is the about page.
- `interiors/index.html` is the interiors page.
- `experiences/index.html` is the experiences page.
- `shop/index.html` is the shop page.
- `contact/index.html` is the contact page.
- `skeleton/index.html` is a reference page.

Shared assets:

- `assets/styles.css` holds the global design system and shared CSS.
- `assets/scripts.js` holds shared site behavior.
- `assets/circular-sticker.js` controls circular sticker text.
- `assets/images/` holds most site images. Most are `.webp`.
- `assets/*.svg` holds logos, icons, wave art, cursor art, and stickers.
- `assets/*.png` holds older or source raster assets.
- `assets/archive/` holds old assets. Do not edit it.

Other files:

- `plans/` holds planning notes.
- `test-rem.html`, `test-width.html`, and `solve.js` are dev scratch files. They are not public site pages.

## Change Copy

Most page copy lives in that page's `index.html`.

Use this process:

1. Find the page file, such as `contact/index.html`.
2. Search for the exact text.
3. Change only the words.
4. Leave classes, IDs, SVG code, scripts, and CSS alone unless the task needs them.
5. Preview the page.
6. Commit and push to `staging`.

Search for text with:

```bash
rg "old phrase"
```

If the same copy appears on several pages, pause. It may be part of a shared pattern.

## Add Or Replace Images

Use this process:

1. Put new web images in `assets/images/`.
2. Prefer `.webp` for photos and cutouts.
3. Use short lowercase names, such as `exp-client-project-01.webp`.
4. Keep the same filename when you replace an existing image.
5. Update the matching `<img src="/assets/images/...">` path.
6. Use useful `alt` text for content images. Use `alt=""` for decoration.

Ask Codex to resize or convert large photo sets before you commit them. Large images slow the site.

## Shared CSS

Use `assets/styles.css` before you add one-off styles.

Use these variables when they apply:

- Colors: `--color-bg`, `--color-ink`, `--color-blue`, `--color-green`, `--color-khaki`, `--color-white`, `--color-yellow`, `--color-pink`, `--color-red`
- Fonts: `--font-display`, `--font-body`, `--font-ui`
- Type: `--type-h1`, `--type-h2`, `--type-b1`, `--type-b2`, `--type-b3`, `--type-nav`, `--type-field`, `--type-button`, `--type-error`
- Layout: `--content-width`, `--content-left`, `--content-left-mobile`, `--content-width-mobile`
- Components: `--radius-button`, `--radius-pill`, `--input-height`, `--button-height`, `--footer-height`, `--wave-height-desktop`, `--wave-height-mobile`

If a value exists as a variable, use the variable. Hardcoded values create drift.

## Shared Parts

Mailing list form:

- Appears on contact, shop, and about.
- The three versions do not match yet.
- Edit copy with care. Do not change the structure unless the task is to unify the form.

Footer and monster wave:

- Appears on many pages.
- Keep the base pattern shared.
- Add page-specific motion on top of the base pattern.

Navigation:

- Desktop and mobile nav use shared code in `assets/scripts.js`.
- If you add, remove, or rename a page, update nav on every page.

## Useful Codex Prompts

For a small copy edit:

```text
Please update the contact page headline from "OLD" to "NEW". First report where it appears, then make only that change.
```

For an image swap:

```text
Please replace the first interiors image with assets/images/new-image.webp. First identify the current image reference, then update only that reference and alt text.
```

For a deploy check:

```text
Please check the current branch and changed files. Tell me what would be pushed to staging. Do not commit or push yet.
```

For going live:

```text
Please prepare a release from staging to main. First show me the commit difference and changed files. Do not merge until I confirm.
```

## Staging Checklist

Before you push to staging:

- Confirm `git status --short --branch` shows `staging`.
- Preview the site.
- Check changed pages on desktop and phone size.
- Confirm no files in `archive/` or `assets/archive/` changed.
- Commit with a clear message.
- Push to `origin staging`.

## Live Checklist

Before you merge to live:

- Check the Vercel staging site.
- Click each changed page.
- Check mobile nav.
- Check any form or interactive part you touched.
- Merge `staging` into `main` through GitHub.
- Confirm the live Vercel deploy succeeds.

