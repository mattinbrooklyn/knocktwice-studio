/*
 * /api/extract — turn a product page into the box model ortho.js draws from.
 *
 * Claude's only job here is reading numbers out of messy retail copy and
 * working out how the modules sit relative to each other. It never draws: the
 * SVG is rendered deterministically in the browser from the JSON this returns,
 * so the same product always produces the same drawing.
 */
import Anthropic from '@anthropic-ai/sdk';

/*
 * The box model, enforced by the API rather than hoped for in the prompt.
 * Every field is required so a half-filled answer fails loudly instead of
 * producing a drawing that is quietly missing an arm.
 */
const SCHEMA = {
  type: 'object',
  properties: {
    meta: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Product name as the retailer writes it' },
        brand: { type: 'string', description: 'Retailer or brand; empty string if unclear' },
        designer: { type: 'string', description: 'Designer if credited, else empty string' },
        sku: { type: 'string', description: 'SKU or item number, else empty string' },
        assumptions: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Every dimension you inferred rather than read. One short sentence each. '
            + 'Empty array only if every number came off the page.',
        },
      },
      required: ['name', 'brand', 'designer', 'sku', 'assumptions'],
      additionalProperties: false,
    },
    overall: {
      type: 'object',
      properties: {
        width: { type: 'number', description: 'Overall width, inches, left to right' },
        depth: { type: 'number', description: 'Overall depth, inches, front to back' },
        height: { type: 'number', description: 'Overall height, inches, floor to top' },
      },
      required: ['width', 'depth', 'height'],
      additionalProperties: false,
    },
    boxes: {
      type: 'array',
      description: 'The piece broken into rectangular blocks. At least one.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Short uppercase name, e.g. CORNER, OTTOMAN, TABLETOP, LEG' },
          x: { type: 'number', description: 'Inches from the left edge to this block' },
          y: { type: 'number', description: 'Inches from the BACK edge to this block' },
          z: { type: 'number', description: 'Inches from the floor to the bottom of this block' },
          w: { type: 'number', description: 'Block width, inches' },
          d: { type: 'number', description: 'Block depth, inches' },
          h: { type: 'number', description: 'Block height, inches' },
        },
        required: ['label', 'x', 'y', 'z', 'w', 'd', 'h'],
        additionalProperties: false,
      },
    },
    details: {
      type: 'array',
      description: 'Published measurements worth printing that are not block sizes: seat height, seat depth, arm height, clearance.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['label', 'value'],
        additionalProperties: false,
      },
    },
    confidence: {
      type: 'string',
      enum: ['published', 'partly inferred', 'mostly inferred'],
      description: 'How much of the geometry came off the page rather than from you',
    },
  },
  required: ['meta', 'overall', 'boxes', 'details', 'confidence'],
  additionalProperties: false,
};

const SYSTEM = `You read furniture product pages and return the geometry needed to draw
accurate orthographic views for interior floorplans.

COORDINATES. Everything is inches. Describe the piece as rectangular blocks:
  x  distance from the LEFT edge of the piece, increasing to the right
  y  distance from the BACK edge of the piece, increasing toward the front
  z  distance from the FLOOR, increasing upward
A block's w/d/h are its own width, depth and height. A block sitting on the
floor has z = 0. The blocks together must fill the overall envelope: the
largest x+w must equal overall width, the largest y+d must equal overall depth,
and the tallest z+h must equal overall height.

HOW MUCH TO BREAK DOWN. Use the blocks the product itself has, not a mesh.
  - A sectional: one block per module, laid out in their actual arrangement.
    A right-arm sectional has its arm module at the right (high x). An L runs
    one leg along the back (y = 0) and the return toward the front.
  - A sofa or chair sold as one piece: a single block, unless arms or a back
    are separately dimensioned and clearly differ in height.
  - A table or desk: the top as one block at its stated height, plus legs or a
    base if their positions are published.
  - Casegoods and beds: usually one block.
Fewer, correct blocks beat many guessed ones.

WHAT COUNTS AS KNOWN. Use published numbers wherever they exist. Where you must
infer to make the blocks close, infer something typical for the piece and record
it in meta.assumptions in plain language. Never invent a published-sounding
figure. If the page gives only overall dimensions, return one block and say so.

Set confidence honestly: "published" only when every block came off the page.`;

const MODEL = 'claude-opus-5';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server.' });
  }

  const { url = '', pageText = '' } = req.body || {};
  let source = pageText.trim();
  let fetchNote = null;

  /*
   * Try the URL only when no text was pasted. Most large retailers sit behind
   * bot protection that refuses a datacenter IP outright, so this is the
   * convenience path, not the one the tool depends on.
   */
  if (!source && url) {
    try {
      const r = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            + ' (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'accept': 'text/html,application/xhtml+xml',
          'accept-language': 'en-US,en;q=0.9',
        },
      });
      if (!r.ok) {
        return res.status(422).json({
          error: `That site refused the request (HTTP ${r.status}). Open the page in your browser, select all, copy, and paste it below.`,
          blocked: true,
        });
      }
      const html = await r.text();
      source = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      fetchNote = 'Fetched from the URL.';
    } catch {
      return res.status(422).json({
        error: 'Could not reach that URL. Paste the page text below instead.',
        blocked: true,
      });
    }
  }

  if (!source) return res.status(400).json({ error: 'Give me a URL or paste the page text.' });

  // Long listings carry reviews and cross-sells we do not need; the dimensions
  // are always near the top.
  const trimmed = source.slice(0, 60000);

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Product page${url ? ` (${url})` : ''}:\n\n${trimmed}`,
      }],
    });

    if (message.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'Claude declined to process that page.' });
    }

    const block = message.content.find(b => b.type === 'text');
    if (!block) return res.status(502).json({ error: 'No usable response from Claude.' });

    let spec;
    try {
      spec = JSON.parse(block.text);
    } catch {
      return res.status(502).json({ error: 'Claude returned something that was not valid JSON.' });
    }

    if (url) spec.meta.url = url;
    if (fetchNote) spec.meta.fetchNote = fetchNote;
    return res.status(200).json({ spec, usage: message.usage });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({ error: err?.message || 'Extraction failed.' });
  }
}
