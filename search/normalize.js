// Turns an adapter's raw product into a database row: clean text, parsed
// dimensions (always stored in cm), material and color vocab matches, a
// category from our fixed list, integer prices, and the search_text that both
// the embedding and the full-text index are built from.

import { createHash } from 'node:crypto';

export const CATEGORY_RULES = [
  ['finish', /\b(paint|wallpaper|wall covering|colour card|color card|sample pot)\b/i],
  ['appliances', /\b(kettle|toaster|grinder|espresso|coffee maker|brewer|blender|speaker|radio|turntable|headphone|air purifier|humidifier|dutch oven|cookware|pan|skillet|pot set)\b/i],
  ['lighting', /\b(lamp|light|pendant|sconce|chandelier|lantern|bulb|luminaire|floor lamp|table lamp|wall lamp)\b/i],
  ['rugs', /\b(rug|runner|carpet|doormat|bath mat|floor mat)\b/i],
  ['mirrors', /\bmirror\b/i],
  ['storage', /\b(shelf|shelves|shelving|cabinet|sideboard|credenza|dresser|bookcase|bookshelf|wardrobe|drawer|rack|trolley|cart|locker|chest|storage|coat stand|hook|peg|organizer|organiser|basket|bin)\b/i],
  ['furniture', /\b(chair|stool|sofa|couch|bench|armchair|lounge|ottoman|pouf|pouffe|daybed|table|desk|console|nightstand|bedside|bed frame|headboard|bed|seat|seating|footstool|chaise|settee|loveseat|recliner)\b/i],
  ['kids', /\b(crib|cot|bassinet|kids|children|toddler|nursery|baby)\b/i],
  ['outdoor', /\b(outdoor|garden|patio|terrace|planter box|adirondack)\b/i],
  ['textiles', /\b(blanket|throw|pillow|cushion|towel|bedding|duvet|sheet|quilt|curtain|tea towel|napkin|tablecloth|placemat|linen|apron|bath sheet|comforter|coverlet|sham)\b/i],
  ['wall-art', /\b(print|poster|artwork|art print|painting|photograph|wall art|frame|framed|canvas|tapestry|wall hanging)\b/i],
  ['tile', /\btiles?\b/i],
  ['hardware', /\b(knob|pull|handle|hinge|hook set|switch plate|door stop|cabinet hardware)\b/i],
  ['tabletop', /\b(plate|bowl|mug|cup|glass|glasses|glassware|vase|vessel|carafe|pitcher|jug|tray|cutlery|flatware|teapot|platter|tumbler|dinnerware|tableware|serving|saucer|dish|coaster|candlestick|candle holder|candleholder|decanter|coffee pot|bottle|ramekin|espresso cup|cookie jar)\b/i],
  ['decor', /\b(candle|holder|object|sculpture|planter|pot|bookend|clock|incense|ornament|figurine|vase|decor|decoration|paperweight|tray|box|catch-all|catchall|magnet|game|puzzle|doorstop|hourglass)\b/i],
];

export const MATERIALS = [
  'oak', 'walnut', 'ash', 'beech', 'maple', 'pine', 'teak', 'birch', 'cherry', 'mahogany', 'plywood', 'bamboo', 'rattan', 'cane', 'wicker', 'cork', 'wood',
  'ceramic', 'stoneware', 'porcelain', 'terracotta', 'earthenware', 'clay',
  'glass', 'crystal', 'acrylic', 'resin', 'plastic', 'polypropylene', 'polycarbonate', 'rubber', 'silicone',
  'brass', 'steel', 'stainless steel', 'aluminum', 'aluminium', 'iron', 'copper', 'chrome', 'bronze', 'nickel', 'powder-coated', 'powder coated', 'metal',
  'marble', 'travertine', 'granite', 'stone', 'concrete', 'terrazzo', 'onyx', 'soapstone',
  'wool', 'cotton', 'linen', 'velvet', 'leather', 'suede', 'bouclé', 'boucle', 'jute', 'sisal', 'hemp', 'felt', 'sheepskin', 'mohair', 'cashmere', 'silk', 'nylon', 'polyester',
  'paper', 'cardboard', 'lacquer', 'lacquered', 'enamel', 'enameled', 'enamelled',
];

export const COLORS = [
  'black', 'white', 'off-white', 'off white', 'cream', 'ivory', 'beige', 'sand', 'tan', 'camel', 'brown', 'chocolate', 'grey', 'gray', 'charcoal', 'slate',
  'red', 'burgundy', 'wine', 'cherry red', 'coral', 'pink', 'blush', 'rose', 'magenta', 'fuchsia', 'orange', 'terracotta', 'rust', 'peach', 'apricot',
  'yellow', 'mustard', 'ochre', 'ocher', 'lemon', 'butter', 'gold',
  'green', 'olive', 'sage', 'forest', 'moss', 'mint', 'emerald', 'teal', 'lime', 'pistachio',
  'blue', 'navy', 'cobalt', 'sky blue', 'powder blue', 'indigo', 'denim', 'turquoise', 'aqua',
  'purple', 'lilac', 'lavender', 'plum', 'violet', 'mauve',
  'natural', 'silver', 'clear', 'transparent', 'amber', 'smoke', 'multicolor', 'multicolour', 'multi', 'striped', 'stripe', 'checkered', 'check',
];

export function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

// ---- Dimensions -----------------------------------------------------------

const NUM = '(\\d+(?:[.,]\\d+)?)';
const UNIT = '(cm|mm|in|inch|inches|"|”|\\u2033|\'\')';
const SEP = '\\s*(?:x|×|by|\\*)\\s*';

function toCm(value, unit) {
  const n = Number.parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const u = (unit || '').toLowerCase();
  if (u === 'mm') return round(n / 10);
  if (u === 'cm') return round(n);
  if (u) return round(n * 2.54); // in, inch, inches, ", ”, ″, ''
  return null;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Extract W/D/H/diameter in cm from free text. Handles "W 45 x D 45 x H 50 cm",
 * "17.7"W x 17.7"D x 19.7"H", "45 x 45 x 50 cm", "Ø 30 cm", "Height: 50 cm",
 * "Dimensions: 20 x 30 in". Unlabeled triples are read as W x D x H.
 */
export function parseDimensions(text) {
  const t = String(text || '').replace(/ /g, ' ');
  const out = { width_cm: null, depth_cm: null, height_cm: null, diameter_cm: null, raw: null };
  if (!t) return out;

  const labelMap = { w: 'width_cm', width: 'width_cm', wide: 'width_cm', l: 'width_cm', length: 'width_cm', long: 'width_cm',
    d: 'depth_cm', depth: 'depth_cm', deep: 'depth_cm', h: 'height_cm', height: 'height_cm', high: 'height_cm', tall: 'height_cm',
    'ø': 'diameter_cm', dia: 'diameter_cm', diam: 'diameter_cm', diameter: 'diameter_cm' };

  // Pattern A: label before number, e.g. "W 45 cm", "Height: 50cm", "Ø30 cm", "Width 17.7 in"
  const LABEL = '(w|width|wide|l|length|d|depth|deep|h|height|high|tall|ø|Ø|dia|diam|diameter)';
  const labeledBefore = new RegExp(`(?<![a-z])${LABEL}(?![a-z])\\.?\\s*[:=]?\\s*${NUM}\\s*${UNIT}?`, 'gi');
  // Pattern B: number then unit then label, e.g. '17.7"W', "45 cm H", "50cm high"
  const labeledAfter = new RegExp(`${NUM}\\s*${UNIT}\\s*${LABEL}(?![a-z])`, 'gi');
  // Pattern C: unlabeled triple with a trailing unit: "45 x 45 x 50 cm", '20" x 20" x 30"'
  const triple = new RegExp(`${NUM}\\s*${UNIT}?${SEP}${NUM}\\s*${UNIT}?${SEP}${NUM}\\s*${UNIT}`, 'i');
  // Pattern D: unlabeled pair (rugs, prints): "120 x 180 cm"
  const pair = new RegExp(`${NUM}\\s*${UNIT}?${SEP}${NUM}\\s*${UNIT}`, 'i');

  const found = {};
  let raw = null;

  // Labeled forms win. Take the first occurrence of each label, so a multi-item
  // description does not mix pieces.
  for (const m of t.matchAll(labeledBefore)) {
    const key = labelMap[m[1].toLowerCase()];
    const unit = m[3] || inferUnit(t);
    if (key && found[key] == null && unit) found[key] = toCm(m[2], unit);
    raw = raw || m[0];
  }
  for (const m of t.matchAll(labeledAfter)) {
    const key = labelMap[m[3].toLowerCase()];
    if (key && found[key] == null) found[key] = toCm(m[1], m[2]);
    raw = raw || m[0];
  }

  if (found.width_cm == null && found.height_cm == null && found.depth_cm == null && found.diameter_cm == null) {
    const m3 = t.match(triple);
    if (m3) {
      const unit = m3[6];
      found.width_cm = toCm(m3[1], m3[2] || unit);
      found.depth_cm = toCm(m3[3], m3[4] || unit);
      found.height_cm = toCm(m3[5], unit);
      raw = m3[0];
    } else {
      const m2 = t.match(pair);
      if (m2) {
        const unit = m2[4];
        found.width_cm = toCm(m2[1], m2[2] || unit);
        found.depth_cm = toCm(m2[3], unit);
        raw = m2[0];
      }
    }
  }

  // Sanity: nothing we index is smaller than 1 mm or larger than 15 m. Anything
  // outside that is a SKU, a phone number, or a parse mistake, not a dimension.
  for (const key of ['width_cm', 'depth_cm', 'height_cm', 'diameter_cm']) {
    if (found[key] != null && !(found[key] >= 0.1 && found[key] <= 1500)) found[key] = null;
  }
  const any = ['width_cm', 'depth_cm', 'height_cm', 'diameter_cm'].some((k) => found[k] != null);
  return { ...out, ...found, raw: any && raw ? raw.trim().slice(0, 120) : null };
}

function inferUnit(text) {
  if (/\bcm\b/i.test(text)) return 'cm';
  if (/\bmm\b/i.test(text)) return 'mm';
  if (/\b(in|inch|inches)\b|["”″]/i.test(text)) return 'in';
  return null;
}

// ---- Vocab matching -------------------------------------------------------

function matchVocab(vocab, text) {
  const lower = ` ${String(text || '').toLowerCase()} `;
  const hits = [];
  for (const term of vocab) {
    const re = new RegExp(`(^|[^a-z])${term.replace(/[-\s]/g, '[-\\s]?')}(?=$|[^a-z])`, 'i');
    if (re.test(lower)) hits.push(term);
  }
  return hits;
}

const MATERIAL_ALIASES = { aluminium: 'aluminum', boucle: 'bouclé', 'powder coated': 'powder-coated', lacquered: 'lacquer', enameled: 'enamel', enamelled: 'enamel', 'stainless steel': 'stainless steel' };
const COLOR_ALIASES = { gray: 'grey', 'off white': 'off-white', ocher: 'ochre', multicolour: 'multicolor', multi: 'multicolor', stripe: 'striped', check: 'checkered' };

function canon(list, aliases) {
  const out = [];
  for (const item of list) {
    const c = aliases[item] || item;
    if (!out.includes(c)) out.push(c);
  }
  // Drop a term that only matched as part of a longer matched term ("white" inside "off-white",
  // "steel" inside "stainless steel"), and generic words when a specific one exists.
  const specific = out.filter((t) => !out.some((u) => u !== t && new RegExp(`(^|[-\\s])${t}($|[-\\s])`).test(u)));
  const WOODS = ['oak', 'walnut', 'ash', 'beech', 'maple', 'pine', 'teak', 'birch', 'cherry', 'mahogany', 'plywood'];
  return specific.filter((t) => !(
    (t === 'metal' && specific.length > 1) ||
    (t === 'wood' && specific.some((x) => WOODS.includes(x)))
  ));
}

export function extractMaterials(...texts) {
  return canon(matchVocab(MATERIALS, texts.join(' ')), MATERIAL_ALIASES).slice(0, 6);
}

export function extractColors(...texts) {
  return canon(matchVocab(COLORS, texts.join(' ')), COLOR_ALIASES).slice(0, 6);
}

// ---- Category -------------------------------------------------------------

// Build plural-tolerant versions of the rules once: "\b(chair|table)\b" also matches "chairs" and "tables".
const PLURAL_RULES = CATEGORY_RULES.map(([cat, re]) => [cat, new RegExp(re.source.replace(/\)\\b$/, ')(?:e?s)?\\b'), re.flags)]);

export function classify({ productType, name, tags = [], brandCategories = [] }) {
  // product_type is the most reliable signal, then the name, then tags.
  for (const text of [productType, name, tags.join(' ')]) {
    if (!text) continue;
    for (const [cat, re] of PLURAL_RULES) {
      if (re.test(text)) return cat;
    }
  }
  if (brandCategories.length === 1 && brandCategories[0] !== 'unknown') return brandCategories[0];
  return null;
}

// ---- Assemble the row -----------------------------------------------------

function cents(n) {
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function normalizeProduct(raw, brand) {
  const description = stripHtml(raw.descriptionHtml).slice(0, 4000);
  const optionText = (raw.options || []).map((o) => `${o.name}: ${(o.values || []).join(', ')}`).join('. ');
  const hintText = (raw.dimensionHints || []).join('. ');
  const dims = parseDimensions([hintText, raw.name, description, optionText].join('\n'));
  const materials = extractMaterials(raw.material, raw.name, raw.productType, (raw.tags || []).join(' '), optionText, description.slice(0, 1500));
  const colors = extractColors(raw.color, raw.name, optionText, (raw.tags || []).join(' '), (raw.variantTitles || []).join(' '));
  const category = classify({ productType: raw.productType, name: raw.name, tags: raw.tags, brandCategories: brand.categories || [] });

  const dimText = dims.raw ? `Dimensions: ${dims.raw}.` : '';
  const searchText = [
    `${raw.vendor && raw.vendor.toLowerCase() !== brand.name.toLowerCase() ? `${raw.vendor} ` : ''}${brand.name} ${raw.name}.`,
    category ? `Category: ${category}.` : '',
    raw.productType ? `Type: ${raw.productType}.` : '',
    materials.length ? `Materials: ${materials.join(', ')}.` : '',
    colors.length ? `Colors: ${colors.join(', ')}.` : '',
    dimText,
    description.slice(0, 1200),
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  return {
    brand_id: brand.id,
    source_url: raw.sourceUrl,
    external_id: raw.externalId ?? null,
    name: raw.name.trim().slice(0, 300),
    vendor: (raw.vendor || '').trim().slice(0, 120) || null,
    description: description || null,
    category,
    price_cents: cents(raw.priceMin),
    price_max_cents: cents(raw.priceMax),
    currency: raw.currency || 'USD',
    width_cm: dims.width_cm,
    depth_cm: dims.depth_cm,
    height_cm: dims.height_cm,
    diameter_cm: dims.diameter_cm,
    dimensions_raw: dims.raw,
    materials,
    colors,
    in_stock: raw.inStock ?? null,
    image_url: raw.images?.[0]?.url ?? null,
    images: (raw.images || []).slice(0, 6),
    search_text: searchText,
    search_hash: createHash('sha256').update(searchText).digest('hex').slice(0, 32),
  };
}
