#!/usr/bin/env python3
"""
sync-from-excel.py — rebuild the estimate page's data from the Excel.

WHAT IT DOES
    Reads the design-package spreadsheet and regenerates the line-item data
    block inside estimate/index.html (between the ESTIMATE-DATA markers).
    Nothing else on the page is touched.

HOW TO USE
    1. Edit the spreadsheet: estimate/_source/design-package.xlsx
       (or save your working copy over it).
    2. From the repo root, run:
           python3 estimate/sync-from-excel.py
    3. Read the report it prints (totals, any missing product photos).
    4. Preview, then commit & push to publish.

NOTES
    - Pure Python standard library — no pip installs, ever.
    - The spreadsheet is the source of truth. Don't hand-edit the data in
      index.html; your edits would be overwritten on the next sync.
    - The round label/date is a deliberate "publish" choice, so it lives in
      index.html (the ROUND constant), not in the Excel.
    - Each row needs a SLUG (stable id → product photo filename). Existing
      rows already have one. For a new row you can leave SLUG blank and the
      tool will derive one from the piece name and tell you what to call its
      image.
"""

import os, re, sys, zipfile
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(REPO, "estimate", "_source", "design-package.xlsx")
PAGE = os.path.join(REPO, "estimate", "index.html")
IMG_DIR = os.path.join(REPO, "assets", "images", "estimate")
SHEET_NAME = "ROUND 1"
START = "/* ESTIMATE-DATA:START"
END = "/* ESTIMATE-DATA:END"

# Categories pinned to the end of the list (in this order), regardless of where
# they sit in the spreadsheet. Everything else keeps its spreadsheet order.
LAST_CATEGORIES = ["Labor & Install"]


# ── Minimal .xlsx reader (stdlib only) ─────────────────────────────────────
def _col(ref):
    """'B7' -> column number 2."""
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n


def read_sheet(path, sheet_name):
    """Return a list of row dicts keyed by header name, for the given sheet."""
    z = zipfile.ZipFile(path)

    # Shared-string table (real Excel/Numbers). May be absent if strings were
    # written inline — handled per-cell below.
    shared = []
    try:
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(f"{NS}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
    except KeyError:
        pass

    # Resolve sheet name -> worksheet xml file via workbook + rels.
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rid = None
    for s in wb.find(f"{NS}sheets"):
        if s.get("name") == sheet_name:
            rid = s.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    target = None
    for rel in rels:
        if rel.get("Id") == rid:
            target = rel.get("Target")
    if not target:
        sys.exit(f"Could not find sheet '{sheet_name}' in {path}")
    target = target.lstrip("/")                 # openpyxl writes absolute targets
    if not target.startswith("xl/"):
        target = "xl/" + target

    sheet = ET.fromstring(z.read(target))
    raw_rows = []
    for row in sheet.iter(f"{NS}row"):
        cells = {}
        for c in row.findall(f"{NS}c"):
            t = c.get("t")
            if t == "inlineStr":                       # string written inline
                is_el = c.find(f"{NS}is")
                val = "".join(x.text or "" for x in is_el.iter(f"{NS}t")) if is_el is not None else ""
            else:
                v = c.find(f"{NS}v")
                if v is None or v.text is None:
                    continue
                val = shared[int(v.text)] if t == "s" else v.text   # shared string or number/formula-result
            cells[_col(c.get("r"))] = val
        if cells:
            raw_rows.append(cells)

    if not raw_rows:
        return []
    header = {col: str(v).strip() for col, v in raw_rows[0].items()}
    out = []
    for cells in raw_rows[1:]:
        out.append({header.get(col, col): val for col, val in cells.items()})
    return out


# ── Helpers ────────────────────────────────────────────────────────────────
def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def slugify(s):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")


def tidy(s):
    """Light brand normalization: hyphen dividers -> em dash, x -> ×."""
    s = (s or "").strip()
    s = s.replace(" - ", " — ")
    s = re.sub(r"(?<=\d)x(?=\d)", "×", s)        # 12x10  -> 12×10
    s = re.sub(r"\s[xX]\s", " × ", s)            # 12 x 10 / L x 65 -> 12 × 10 / L × 65
    return s


def js(s):
    """Escape a Python string for a double-quoted JS string literal.
    (Sizes contain inch marks like 64" — the double quote must be escaped.)"""
    return (s or "").replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")


# ── Build the CART structure from rows ─────────────────────────────────────
def build_cart(rows):
    groups = {}   # category -> list of item dicts (insertion-ordered)
    for r in rows:
        cat = (r.get("CATEGORY") or "").strip()
        piece = (r.get("PIECE") or "").strip()
        qty, price = num(r.get("QTY")), num(r.get("PRICE"))
        if not (cat and piece and qty is not None and price is not None):
            continue  # skips blanks and the summary block at the bottom
        link = (r.get("LINK") or "").strip()
        if link.upper() in ("", "N/A", "TBD", "NONE"):
            link = ""
        item = {
            "slug": (r.get("SLUG") or "").strip() or slugify(piece),
            "piece": tidy(piece),
            "retailer": (r.get("RETAILER") or "").strip(),
            "size": tidy(r.get("SIZE") or ""),
            "color": (r.get("COLOR") or "").strip(),
            "qty": int(qty) if qty == int(qty) else qty,
            "unit": round(price, 2),
            "total": round(qty * price, 2),
            "link": link,
        }
        groups.setdefault(cat, []).append(item)

    # Disambiguate duplicate piece names within a category (e.g. two "Crates")
    # by folding the distinguishing field into the title, so radio groups and
    # inbox labels stay unique — and drop that field from the meta to avoid
    # repeating it.
    for items in groups.values():
        seen = {}
        for it in items:
            seen.setdefault(it["piece"], []).append(it)
        for piece, dupes in seen.items():
            if len(dupes) < 2:
                continue
            for field in ("size", "color"):
                vals = [d[field] for d in dupes]
                if len(set(vals)) == len(vals) and all(vals):
                    for d in dupes:
                        d["piece"] = f"{piece} — {d[field]}"
                        d[field] = ""   # avoid repeating it in the meta line
                    break
    ordered = [(cat, items) for cat, items in groups.items()]
    # Pin LAST_CATEGORIES to the end; everything else keeps spreadsheet order.
    ordered.sort(key=lambda ci: (1, LAST_CATEGORIES.index(ci[0])) if ci[0] in LAST_CATEGORIES else (0, 0))
    return ordered


def generate_js(cart):
    lines = ["  const CART = ["]
    for cat, items in cart:
        lines.append(f"    {{ cat: \"{js(cat)}\", items: [")
        for it in items:
            qty = it["qty"]
            lines.append(
                f"      {{ slug:\"{js(it['slug'])}\", piece:\"{js(it['piece'])}\", "
                f"retailer:\"{js(it['retailer'])}\", size:\"{js(it['size'])}\", "
                f"color:\"{js(it['color'])}\", qty:{qty}, unit:{it['unit']:g}, "
                f"total:{it['total']:g}, link:\"{js(it['link'])}\" }},"
            )
        lines.append("    ]},")
    lines.append("  ];")
    return "\n".join(lines)


# ── Inject into index.html ─────────────────────────────────────────────────
def inject(js_block):
    html = open(PAGE, encoding="utf-8").read()
    if START not in html or END not in html:
        sys.exit("Could not find the ESTIMATE-DATA markers in index.html.")
    pre = html.split(START, 1)[0]
    # Everything after the END marker's own closing "*/" — so re-running is
    # idempotent and never accumulates stray comment tails.
    post = html.split(END, 1)[1].split("*/", 1)[1]
    start_line = START + " — auto-generated from the Excel by sync-from-excel.py. Do not edit by hand. */"
    end_line = END + " */"
    new = f"{pre}{start_line}\n{js_block}\n  {end_line}{post}"
    open(PAGE, "w", encoding="utf-8").write(new)


# ── Report ─────────────────────────────────────────────────────────────────
def report(cart):
    total = 0.0
    missing_img, missing_slug = [], []
    print("\n  Category                       Pieces      Subtotal")
    print("  " + "-" * 52)
    for cat, items in cart:
        sub = sum(it["total"] for it in items)
        total += sub
        print(f"  {cat:<30} {len(items):>5}   ${sub:>11,.2f}")
        for it in items:
            if not os.path.exists(os.path.join(IMG_DIR, it["slug"] + ".webp")):
                missing_img.append((it["piece"], it["slug"]))
    print("  " + "-" * 52)
    n = sum(len(i) for _, i in cart)
    print(f"  {'TOTAL':<30} {n:>5}   ${total:>11,.2f}\n")

    if missing_img:
        print(f"  ⚠ {len(missing_img)} item(s) have no product photo yet")
        print(f"    (drop a <slug>.webp into assets/images/estimate/ — a placeholder shows until then):")
        for piece, slug in missing_img:
            print(f"      • {piece}  →  {slug}.webp")
        print()
    print("  ✓ index.html updated. Preview, then commit & push to publish.\n")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else XLSX
    if not os.path.exists(path):
        sys.exit(f"Spreadsheet not found: {path}")
    rows = read_sheet(path, SHEET_NAME)
    cart = build_cart(rows)
    if not cart:
        sys.exit("No item rows found — check the sheet name and columns.")
    inject(generate_js(cart))
    print(f"\n  Synced from: {os.path.relpath(path, REPO)}  (sheet: {SHEET_NAME})")
    report(cart)
