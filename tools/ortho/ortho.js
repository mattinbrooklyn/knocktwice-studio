/*
 * ortho.js — orthographic furniture drawings for floorplan work.
 *
 * A piece of furniture is described once, as a list of boxes in real-world
 * inches. Every view is a projection of that same list, so the plan and the
 * elevations can never disagree with each other the way separately drawn views
 * can. Add a box and it appears, correctly placed, in all five views.
 *
 * Coordinates, all in inches:
 *   x  left  -> right   (width)
 *   y  back  -> front   (depth)
 *   z  floor -> up      (height)
 */

export const SCALE_NOTE = '1cm = 1 inch';

/*
 * One drawing unit is one inch of furniture, and the SVG is sized in
 * centimetres, so a unit prints as a centimetre. That means a millimetre of ink
 * is a TENTH of a unit. Line weights have to be written in these terms or they
 * scale up with the furniture and print as slabs — the trap that makes naive
 * rescaling look wrong.
 */
const MM = 0.1;

const LINE = {
  silhouette: 0.7 * MM,
  seam:       0.35 * MM,
  ghost:      0.25 * MM,
  dim:        0.25 * MM,
  ground:     0.5 * MM,
};

const TYPE = { heading: 4, subhead: 2.6, label: 2.6, dim: 2.8, note: 2.3, small: 2.1 };
const INK  = { line: '#111', dim: '#555', ext: '#999', ghost: '#8c8c8c' };
const FONT = 'Helvetica, Arial, sans-serif';

/*
 * How far behind the frontmost surface a box has to sit before it is drawn as a
 * background object rather than a solid one. Two feet is the convention that
 * matches how these read on a plan: the far arm of a sectional is genuinely
 * visible in a side elevation, it just shouldn't compete with what's in front.
 */
const GHOST_SETBACK = 24;

/* Room reserved around the geometry for dimension strings and the caption. */
const PAD = { top: 19, left: 13, right: 13, bottom: 17 };

/* ------------------------------------------------------------------ atoms */

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = v => String(Math.round(v * 1000) / 1000);

function line(x1, y1, x2, y2, stroke, width, dash) {
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"`
       + ` stroke="${stroke}" stroke-width="${n(width)}"`
       + (dash ? ` stroke-dasharray="${dash}"` : '') + '/>';
}

function rectTag(x, y, w, h, { fill = 'none', stroke, width }) {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"`
       + ` fill="${fill}" stroke="${stroke}" stroke-width="${n(width)}"/>`;
}

function label(x, y, str, size, opts = {}) {
  const { anchor = 'middle', weight = 'normal', fill = INK.line, rotate = null } = opts;
  const turn = rotate === null ? '' : ` transform="rotate(${rotate} ${n(x)} ${n(y)})"`;
  return `<text x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${n(size)}"`
       + ` font-weight="${weight}" text-anchor="${anchor}" fill="${fill}"${turn}>`
       + `${esc(str)}</text>`;
}

function feetInches(inches) {
  const ft = Math.floor(inches / 12);
  const rest = Math.round(inches - ft * 12);
  return rest ? `${ft}'-${rest}"` : `${ft}'-0"`;
}

/* Spans of six feet or more carry a feet-and-inches reading as well; below that
 * the bare inch figure is what anyone specifying furniture actually wants. */
function dimText(inches) {
  const bare = `${+inches.toFixed(2)}"`;
  return inches >= 72 ? `${bare} (${feetInches(inches)})` : bare;
}

/* ------------------------------------------------------- dimension strings */

const TICK = 1.25;

/* `edge` is where the object sits, so the thin extension line can reach back to
 * it; the dimension line itself stands off at `at`. */
function dimRun(horizontal, from, to, at, edge, text, size = TYPE.dim) {
  const out = [];
  const dir = Math.sign(edge - at) || 1;      // which way the object lies
  const put = (a, b) => (horizontal ? [a, b] : [b, a]);

  out.push(line(...put(from, at), ...put(to, at), INK.dim, LINE.dim));

  for (const p of [from, to]) {
    // A 45-degree tick, the drafting convention for a measured end.
    out.push(line(...put(p - TICK, at + TICK), ...put(p + TICK, at - TICK), INK.dim, LINE.dim));
    out.push(line(...put(p, edge), ...put(p, at + dir * TICK * 1.2), INK.ext, LINE.dim));
  }

  const mid = (from + to) / 2;
  const off = at - dir * 1.3;                 // figure sits clear of the line
  out.push(horizontal
    ? label(mid, off, text, size)
    : label(off, mid, text, size, { rotate: -90 }));
  return out.join('');
}

/* ------------------------------------------------------------- silhouette */

/*
 * The exact outline of a set of axis-aligned rectangles.
 *
 * Every rectangle edge is cut wherever another rectangle's edge crosses it, and
 * each piece is kept only if the space just outside it is empty. Pieces buried
 * between two touching boxes fail that test and drop out, which is what
 * separates the outline from the seams — and lets the outline carry a heavier
 * weight without the interior joins thickening with it.
 */
function unionOutline(rects) {
  const NUDGE = 0.02;
  const covered = (px, py) => rects.some(r =>
    px > r.h + 1e-9 && px < r.h + r.hw - 1e-9 &&
    py > r.v + 1e-9 && py < r.v + r.vh - 1e-9);

  const cutsWithin = (values, lo, hi) => {
    const set = new Set([lo, hi]);
    for (const v of values) if (v > lo && v < hi) set.add(v);
    return [...set].sort((a, b) => a - b);
  };

  const allH = rects.flatMap(r => [r.h, r.h + r.hw]);
  const allV = rects.flatMap(r => [r.v, r.v + r.vh]);
  const keep = new Map();

  for (const r of rects) {
    const xs = cutsWithin(allH, r.h, r.h + r.hw);
    const ys = cutsWithin(allV, r.v, r.v + r.vh);

    for (let i = 0; i < xs.length - 1; i++) {
      const mid = (xs[i] + xs[i + 1]) / 2;
      for (const [edgeV, normal] of [[r.v, -1], [r.v + r.vh, 1]]) {
        if (!covered(mid, edgeV + normal * NUDGE)) {
          keep.set(`h|${n(edgeV)}|${n(xs[i])}|${n(xs[i + 1])}`,
                   { horizontal: true, at: edgeV, from: xs[i], to: xs[i + 1] });
        }
      }
    }
    for (let i = 0; i < ys.length - 1; i++) {
      const mid = (ys[i] + ys[i + 1]) / 2;
      for (const [edgeH, normal] of [[r.h, -1], [r.h + r.hw, 1]]) {
        if (!covered(edgeH + normal * NUDGE, mid)) {
          keep.set(`v|${n(edgeH)}|${n(ys[i])}|${n(ys[i + 1])}`,
                   { horizontal: false, at: edgeH, from: ys[i], to: ys[i + 1] });
        }
      }
    }
  }

  // Butt the surviving pieces back together so the file carries whole edges
  // rather than a rash of fragments.
  const merged = [];
  const byRun = new Map();
  for (const s of keep.values()) {
    const k = `${s.horizontal ? 'h' : 'v'}|${n(s.at)}`;
    if (!byRun.has(k)) byRun.set(k, []);
    byRun.get(k).push(s);
  }
  for (const group of byRun.values()) {
    group.sort((a, b) => a.from - b.from);
    let run = { ...group[0] };
    for (const s of group.slice(1)) {
      if (Math.abs(s.from - run.to) < 1e-6) run.to = s.to;
      else { merged.push(run); run = { ...s }; }
    }
    merged.push(run);
  }
  return merged;
}

/* ------------------------------------------------------------------ views */

export const VIEWS = {
  plan: {
    title: 'PLAN (TOP)',
    note: 'Viewed from above, front of piece at bottom',
    project: (b, o) => ({ h: b.x, v: b.y, hw: b.w, vh: b.d, near: b.z + b.h }),
    axes: { across: 'width', down: 'depth' },
    ground: false,
  },
  front: {
    title: 'FRONT ELEVATION',
    note: 'Viewed from the front',
    project: (b, o) => ({ h: b.x, v: o.height - (b.z + b.h), hw: b.w, vh: b.h, near: b.y + b.d }),
    axes: { across: 'width', down: 'height' },
    ground: true,
  },
  back: {
    title: 'BACK ELEVATION',
    note: 'Viewed from behind, so the right of the piece reads on the left',
    project: (b, o) => ({ h: o.width - (b.x + b.w), v: o.height - (b.z + b.h), hw: b.w, vh: b.h, near: -b.y }),
    axes: { across: 'width', down: 'height' },
    ground: true,
  },
  left: {
    title: 'LEFT SIDE ELEVATION',
    note: 'Back of piece at left, front at right',
    project: (b, o) => ({ h: b.y, v: o.height - (b.z + b.h), hw: b.d, vh: b.h, near: -b.x }),
    axes: { across: 'depth', down: 'height' },
    ground: true,
  },
  right: {
    title: 'RIGHT SIDE ELEVATION',
    note: 'Front of piece at left, back at right',
    project: (b, o) => ({ h: o.depth - (b.y + b.d), v: o.height - (b.z + b.h), hw: b.d, vh: b.h, near: b.x }),
    axes: { across: 'depth', down: 'height' },
    ground: true,
  },
};

const fullyInside = (a, b) =>          // is rect a wholly within rect b
  a.h >= b.h - 1e-6 && a.h + a.hw <= b.h + b.hw + 1e-6 &&
  a.v >= b.v - 1e-6 && a.v + a.vh <= b.v + b.vh + 1e-6;

/*
 * Project every box, then work out what each one should look like: solid if it
 * is at the front, a background object if it sits well behind, and dropped from
 * the labelling altogether if something nearer covers it completely.
 */
function stack(spec, view) {
  const parts = spec.boxes.map((box, i) => ({ box, i, ...view.project(box, spec.overall) }));

  for (const p of parts) {
    p.hidden = parts.some(q => q !== p && q.near > p.near && fullyInside(p, q));
  }

  /*
   * Which depth carries the piece. Grouping the visible boxes by depth and
   * taking the one with the most projected area finds the main body rather than
   * whatever happens to be closest: a front elevation should draw the sofa
   * solid with the ottoman in front of it, not demote the sofa for being behind.
   */
  const area = new Map();
  for (const p of parts) {
    if (p.hidden) continue;
    area.set(p.near, (area.get(p.near) || 0) + p.hw * p.vh);
  }
  let primary = 0, best = -1;
  for (const [near, a] of area) if (a > best) { best = a; primary = near; }

  // Only what sits well BEHIND the main body reads as a background object.
  for (const p of parts) p.ghost = !p.hidden && primary - p.near > GHOST_SETBACK;

  // Painter's order: furthest first, so nearer boxes mask what is behind them.
  parts.sort((a, b) => a.near - b.near || a.i - b.i);
  return parts;
}

/*
 * Where a name can sit without landing on something drawn in front of it: the
 * tallest clear gap down the middle of the box.
 */
function clearBand(part, parts) {
  const cx = part.h + part.hw / 2;
  const blocked = parts
    .filter(q => q !== part && q.near > part.near && cx > q.h && cx < q.h + q.hw)
    .map(q => [Math.max(q.v, part.v), Math.min(q.v + q.vh, part.v + part.vh)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);

  let top = part.v, bandTop = part.v, bandH = 0;
  for (const [a, b] of blocked) {
    if (a - top > bandH) { bandTop = top; bandH = a - top; }
    top = Math.max(top, b);
  }
  if (part.v + part.vh - top > bandH) { bandTop = top; bandH = part.v + part.vh - top; }
  return { centre: bandTop + bandH / 2, height: bandH };
}

/*
 * One view, drawn into its own local coordinate space with (0,0) at the top
 * left of everything including dimensions and caption, so the sheet can place
 * it without knowing anything about its contents.
 */
export function renderView(spec, viewName) {
  const view = VIEWS[viewName];
  if (!view) throw new Error(`unknown view: ${viewName}`);

  const parts = stack(spec, view);
  const across = Math.max(...parts.map(p => p.h + p.hw));
  const down = Math.max(...parts.map(p => p.v + p.vh));
  const ox = PAD.left, oy = PAD.top;
  const out = [];

  // Fills first, so nearer boxes hide what is behind them, then the seams.
  for (const p of parts) {
    const fill = p.ghost ? '#f4f4f4' : '#fff';
    out.push(rectTag(ox + p.h, oy + p.v, p.hw, p.vh,
      { fill, stroke: p.ghost ? INK.ghost : INK.line, width: p.ghost ? LINE.ghost : LINE.seam }));
  }

  // The silhouette of the solid boxes, carrying the heavier weight.
  const solid = parts.filter(p => !p.ghost);
  for (const s of unionOutline(solid)) {
    const [x1, y1, x2, y2] = s.horizontal
      ? [s.from, s.at, s.to, s.at]
      : [s.at, s.from, s.at, s.to];
    out.push(line(ox + x1, oy + y1, ox + x2, oy + y2, INK.line, LINE.silhouette));
  }

  if (view.ground) {
    out.push(line(ox - 6, oy + down, ox + across + 6, oy + down, INK.line, LINE.ground));
  }

  // Module names, on the boxes you can actually see, in the clear.
  for (const p of parts) {
    if (p.hidden || !p.box.label) continue;
    const size = p.hw < 30 ? TYPE.small : TYPE.label;
    const band = clearBand(p, parts);
    if (band.height < size * 1.3) continue;   // nowhere to put it without a clash
    const text = p.ghost ? `${p.box.label} (beyond)` : p.box.label;
    out.push(label(ox + p.h + p.hw / 2, oy + band.centre + size * 0.35, text, size,
      { fill: p.ghost ? INK.ghost : INK.line }));
  }

  // Overall span above, and the module breakdown tucked beneath it.
  out.push(dimRun(true, ox, ox + across, oy - 16, oy, dimText(across)));

  const seams = [...new Set(parts.filter(p => !p.ghost && !p.hidden)
    .flatMap(p => [p.h, p.h + p.hw]))].sort((a, b) => a - b);
  if (seams.length > 2) {
    for (let i = 0; i < seams.length - 1; i++) {
      out.push(dimRun(true, ox + seams[i], ox + seams[i + 1], oy - 8, oy,
        dimText(seams[i + 1] - seams[i])));
    }
  }

  // Overall height or depth down the left.
  out.push(dimRun(false, oy, oy + down, ox - 10, ox, dimText(down)));

  const width = PAD.left + across + PAD.right;
  const height = PAD.top + down + PAD.bottom;

  out.push(label(ox - PAD.left + 0, oy + down + 6, view.title, TYPE.heading, { anchor: 'start', weight: 'bold' }));
  out.push(label(ox - PAD.left + 0, oy + down + 10.5, view.note, TYPE.subhead, { anchor: 'start' }));

  const buried = parts.filter(p => p.hidden && p.box.label).map(p => p.box.label);
  if (buried.length) {
    out.push(label(ox - PAD.left + 0, oy + down + 14.5,
      `(${[...new Set(buried)].join(', ').toLowerCase()} concealed in this view)`,
      TYPE.note, { anchor: 'start' }));
  }

  return { body: out.join('\n'), width, height };
}

/* ------------------------------------------------------------ title block */

function titleBlock(spec, width) {
  const m = spec.meta || {};
  const rows = [];
  const line1 = [m.brand, m.designer && `design by ${m.designer}`, m.sku && `SKU ${m.sku}`]
    .filter(Boolean).join(' / ');

  const o = spec.overall;
  rows.push(`Overall ${+o.width}W x ${+o.depth}D x ${+o.height}H inches.`);
  const mods = spec.boxes.filter(b => b.label)
    .map(b => `${b.label.toLowerCase()} ${+b.w}x${+b.d}${b.h !== o.height ? `x${+b.h}H` : ''}`);
  if (mods.length > 1) rows.push(`Modules: ${mods.join(', ')}.`);
  // Details arrive as a list from the extractor and as an object from hand-
  // written specs; both are worth printing, so accept either.
  const details = Array.isArray(spec.details)
    ? spec.details.map(d => [d.label, d.value])
    : Object.entries(spec.details || {});
  for (const [k, v] of details) {
    rows.push(`${String(k).replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}: ${v}.`);
  }

  const out = [];
  let y = 8;
  out.push(label(4, y, (m.name || 'UNTITLED').toUpperCase(), 3.2, { anchor: 'start', weight: 'bold' }));
  if (line1) { y += 5; out.push(label(4, y, line1, TYPE.note, { anchor: 'start' })); }
  y += 3;
  for (const r of rows) { y += 4; out.push(label(4, y, r, TYPE.note, { anchor: 'start' })); }

  if ((spec.meta?.assumptions || []).length) {
    y += 6;
    out.push(label(4, y, 'ASSUMED, VERIFY BEFORE ORDERING', TYPE.note, { anchor: 'start', weight: 'bold' }));
    for (const a of spec.meta.assumptions) { y += 4; out.push(label(4, y, `- ${a}`, TYPE.note, { anchor: 'start' })); }
  }

  y += 6;
  out.push(label(4, y, `SCALE ${SCALE_NOTE} — place at 100%, do not rescale`, TYPE.note,
    { anchor: 'start', weight: 'bold' }));
  if (m.url) { y += 4; out.push(label(4, y, m.url.slice(0, 96), 1.9, { anchor: 'start', fill: INK.dim })); }

  const height = y + 6;
  return {
    body: rectTag(0, 0, width, height, { stroke: INK.dim, width: LINE.ghost }) + '\n' + out.join('\n'),
    width, height,
  };
}

/* ----------------------------------------------------------------- output */

/*
 * The SVG is sized in centimetres while its coordinates are inches, which is
 * the whole trick: one inch of furniture arrives in Illustrator as one
 * centimetre, matching the studio's plan scale with no rescaling to get wrong.
 */
function document_(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}cm" height="${n(height)}cm"`
       + ` viewBox="0 0 ${n(width)} ${n(height)}">\n`
       + `<rect width="${n(width)}" height="${n(height)}" fill="#fff"/>\n${body}\n</svg>\n`;
}

export function renderSingle(spec, viewName) {
  const v = renderView(spec, viewName);
  return document_(v.width, v.height, v.body);
}

/* All five views plus the title block on one sheet, in two columns. */
export function renderSheet(spec) {
  const GUTTER = 14;
  const leftNames = ['plan', 'front', 'back'];
  const rightNames = ['left', 'right'];

  const left = leftNames.map(v => renderView(spec, v));
  const right = rightNames.map(v => renderView(spec, v));

  const leftW = Math.max(...left.map(v => v.width));
  const rightViewsW = Math.max(...right.map(v => v.width));
  const block = titleBlock(spec, Math.max(rightViewsW, 96));
  const rightW = Math.max(rightViewsW, block.width);

  const place = (views, x) => {
    const parts = [];
    let y = 0;
    for (const v of views) {
      parts.push(`<g transform="translate(${n(x)} ${n(y)})">\n${v.body}\n</g>`);
      y += v.height + GUTTER;
    }
    return { svg: parts.join('\n'), end: y };
  };

  const colL = place(left, 0);
  const colR = place(right, leftW + GUTTER);
  const blockY = colR.end;
  const body = colL.svg + '\n' + colR.svg + '\n'
    + `<g transform="translate(${n(leftW + GUTTER)} ${n(blockY)})">\n${block.body}\n</g>`;

  const width = leftW + GUTTER + rightW;
  const height = Math.max(colL.end, blockY + block.height);
  return document_(width, height, body);
}

export const VIEW_NAMES = Object.keys(VIEWS);
