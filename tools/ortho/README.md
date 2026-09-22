# Ortho

Drop in a furniture product page, get orthographic drawings sized for the
studio's Illustrator floorplans at **1cm = 1 inch**.

## How it works

Claude reads the product page and returns **numbers only** — the piece broken
into rectangular blocks in real-world inches. The drawing itself is rendered by
`ortho.js`, deterministically, in the browser. That split is deliberate: a model
asked to emit SVG produces a slightly different and occasionally malformed
drawing every run, while a model asked for measurements produces something you
can check and correct before anything is drawn.

Because every view is a projection of the same block list, the plan and the
elevations cannot contradict each other.

## Scale

The SVG carries inch coordinates but is sized in centimetres, so a 145" sofa
arrives 145cm wide. Place at 100% in Illustrator — never rescale. Line weights
are written in absolute millimetres so they stay proper drafting lines instead
of scaling up with the furniture.

## Deploying

This folder is its own Vercel project, separate from the main site.

1. Vercel dashboard → Add New → Project → import this repo.
2. Set **Root Directory** to `tools/ortho`.
3. Add two environment variables:
   - `ANTHROPIC_API_KEY` — from console.anthropic.com
   - `ORTHO_PASSWORD` — any shared phrase; you and your partner type it once
4. Deploy. Share the URL and the password.

The password gates `/api/extract`, so nobody can spend the API key. The page
itself is harmless static HTML and carries `noindex`.

## Running the renderer without the web app

    node build.mjs faible.json out

Writes a combined sheet plus one SVG per view. `faible.json` doubles as the
reference spec and the format example.

## The spec format

```jsonc
{
  "meta": { "name": "...", "brand": "...", "sku": "...", "assumptions": ["..."] },
  "overall": { "width": 145, "depth": 90, "height": 29 },
  "details": [{ "label": "Seat depth", "value": "32\"" }],
  "boxes": [
    // x from the left, y from the BACK, z from the floor; w/d/h are the block's own
    { "label": "CORNER", "x": 0, "y": 0, "z": 0, "w": 45, "d": 45, "h": 29 }
  ]
}
```

Blocks must fill the envelope: the largest `x+w` equals overall width, the
largest `y+d` equals overall depth, the tallest `z+h` equals overall height.
