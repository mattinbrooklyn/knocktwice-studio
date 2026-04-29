# Knock Twice Studio — AGENTS.md

## What this project is

Ground-up responsive rebuild of knocktwice.studio. The goal is a fluid, premium, cohesive experience across desktop and mobile. Figma designs exist for both breakpoints. The site should feel elevated and slick — not like a template, not like a dev project. Like a real studio's portfolio.

## Stack

Static site: HTML, CSS, JS → GitHub → Vercel.
Staging branch: `rebuild` (deployed automatically). Main branch = live site, never touch it.
Figma MCP connected via figma-desktop at localhost:3845.

## Development scope

Do **not** modify [`archive/`](archive/) (preserved legacy / stubs). Active work stays in repo root [`index.html`](index.html), [`about/`](about/), [`contact/`](contact/), [`experiences/`](experiences/), [`home/`](home/), [`interiors/`](interiors/), [`shop/`](shop/), [`skeleton/`](skeleton/), and [`assets/`](assets/) when global CSS/JS or shared assets are required. See [`docs/todo/00-README.md`](docs/todo/00-README.md).

## The person you're working with

Matt is not a developer. He directs Codex. He has strong design instincts and learns fast, but don't assume hard dev knowledge. Give him one clear recommendation with reasoning, not a menu of options. Be direct. Push back when something is wrong. Flag issues before they compound.

## How sessions work

- One session, one goal. Never expand scope mid-session.
- Find-then-fix two-prompt pattern: first prompt locates and reports without changing anything. Second prompt executes with hardcoded specifics.
- Kill anything running over 7-8 minutes and break it into smaller steps.
- After 3-4 exchanges, describe what changed and what's about to happen next. This catches drift.
- Surgical single-issue prompts beat large multi-fix prompts every time.
- Never run a destructive action without explicit confirmation.
- If answers are getting vague or the session feels unfocused, say so and suggest starting fresh.

## Design principles

- **Systems before components.** Build the foundation, then apply it. Never patch one page when the fix should be systemic.
- **Read-only first.** Always know what's there before changing it.
- **One source of truth.** If something appears on multiple pages, it should be defined once and referenced everywhere. Page-specific tweaks layer on top — they never fork the base.
- **Pixel-perfect at 1440px first, then convert to fluid.** Don't solve both at once.
- **The cascade is a river.** When something looks wrong, diagnose which rule is winning before adding a new one.
- **Commit working states frequently.** There should always be a safe rollback point.
- **Test in the actual environment.** Localhost and production can behave differently.

## Design system

All shared styles live in `assets/styles.css`. Page-specific styles go in `<style>` tags on each page, but they should reference the design system variables — not hardcode values.

Key variables to always use (never hardcode these):
- Colors: `--color-bg`, `--color-ink`, `--color-blue`, `--color-green`, `--color-khaki`, `--color-white`, `--color-yellow`, `--color-pink`, `--color-red`
- Fonts: `--font-display` (Erica One), `--font-body` (Instrument Sans), `--font-ui` (Handjet)
- Type scale: `--type-h1`, `--type-h2`, `--type-b1`, `--type-b2`, `--type-b3`, `--type-nav`, `--type-field`, `--type-button`, `--type-error`
- Layout: `--content-width`, `--content-left`, `--content-left-mobile`, `--content-width-mobile`
- Components: `--radius-button`, `--radius-pill`, `--input-height`, `--button-height`, `--footer-height`, `--wave-height-desktop`, `--wave-height-mobile`

If a value exists as a variable, use the variable. If you find a hardcoded value that should be a variable, flag it.

## Shared components

These appear on multiple pages and must be maintained as single-source patterns:

**Mailing list module** — email signup form with default, error, and success states. Currently exists in three divergent implementations (contact, shop, about). Needs to be unified into one pattern.

**Footer + monster wave** — blue wave SVG with eye-tracking irises, footer bar with social icons and copyright. Base pattern is the same across all pages; some pages add animations on top (pop-up, rise, ticker). The base should be shared; page-specific behavior layers on.

## Before starting any new work

1. Read this file.
2. Read the SESSION.md file (Matt writes this fresh before each session with the specific goal).
3. Do a read-only audit of the relevant files before making changes.
4. If the work touches something that exists on multiple pages, think about whether the fix should be systemic before making it page-specific.

## Figma workflow

- Use Figma MCP to extract actual values (spacing, sizes, colors) before building or refining.
- Screenshots are also fine as reference.
- Figma is the source of truth for visual design. When the code doesn't match Figma, the code is wrong.

## Mental models for Matt

- HTML = architecture, CSS = appearance, JS = behavior. They're separate layers.
- `clamp()` = min, fluid middle, max. Figma desktop designs give the max values. Mobile designs give the min values.
- The design system variables are the contract between the global styles and individual pages. Breaking that contract (hardcoding values) creates drift.
