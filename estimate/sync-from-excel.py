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
    - Product photos come from the IMAGE column: paste a Google Drive share
      link (the file must be shared "Anyone with the link: Viewer") or a plain
      image URL. The tool downloads each into assets/images/estimate/ and the
      page loads the local copy — so a photo never breaks if the source moves.
      Leave IMAGE blank to fall back to any existing local photo / placeholder.
"""

import os, re, sys, zipfile, urllib.request
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(REPO, "estimate", "_source", "design-package.xlsx")
CACHE = os.path.join(REPO, "estimate", "_source", ".sheet-cache.xlsx")  # gitignored
PAGE = os.path.join(REPO, "estimate", "index.html")
IMG_DIR = os.path.join(REPO, "assets", "images", "estimate")
SHEET_NAME = "ROUND 1"

# Paste your shared Google Sheet link here (Share → "Anyone with the link:
# Viewer"). When set, the tool pulls the latest Sheet on each run. Leave blank
# to read the local Excel file instead. A URL passed on the command line wins.
GOOGLE_SHEET = "https://docs.google.com/spreadsheets/d/1EpT8bsdPsnBvxHSF_FMZiubE-9elqon6iZt97bzGJ1E/edit"
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
    # Falls back to the first sheet if the named tab isn't found.
    RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    sheets = list(wb.find(f"{NS}sheets"))
    rid = next((s.get(RID) for s in sheets if s.get("name") == sheet_name), None)
    if rid is None and sheets:
        print(f"  (No '{sheet_name}' tab — using first tab '{sheets[0].get('name')}'.)")
        rid = sheets[0].get(RID)
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
            "slug": (r.get("SLUG") or "").strip(),   # filled below from final piece if blank
            "piece": tidy(piece),
            "retailer": (r.get("RETAILER") or "").strip(),
            "size": tidy(r.get("SIZE") or ""),
            "color": (r.get("COLOR") or "").strip(),
            "qty": int(qty) if qty == int(qty) else qty,
            "unit": round(price, 2),
            "total": round(qty * price, 2),
            "link": link,
            "flag": (r.get("NOTES") or "").strip(),   # your note to the client (the "↳" line)
            "image_url": (r.get("IMAGE") or "").strip(),  # Drive share link / direct URL; pulled below
            "img": "",                                    # local filename, resolved by download_images()
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
    # Fill any blank slug from the FINAL (disambiguated) piece name, so duplicate
    # pieces get unique slugs (Crates — Medium → crates-medium). An explicit SLUG
    # column always wins.
    for items in groups.values():
        for it in items:
            if not it["slug"]:
                it["slug"] = slugify(it["piece"])

    ordered = [(cat, items) for cat, items in groups.items()]
    # Pin LAST_CATEGORIES to the end; everything else keeps spreadsheet order.
    ordered.sort(key=lambda ci: (1, LAST_CATEGORIES.index(ci[0])) if ci[0] in LAST_CATEGORIES else (0, 0))
    return ordered


# ── Images: pull whatever's in the IMAGE column into the repo ───────────────
# A Google Drive "share link" points at a viewer page, not the file — so we
# pull the id out and hit the direct-download endpoint. Plain image URLs work
# too. Each image lands as assets/images/estimate/<slug>.<ext> and the filename
# is recorded on the item; the page just loads the local copy.
DRIVE_ID_RE = re.compile(r"(?:/d/|[?&]id=)([a-zA-Z0-9_-]{20,})")
EXT_BY_CT = {"image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg",
             "image/webp": ".webp", "image/gif": ".gif"}


def _existing_local(slug):
    """Any already-downloaded photo for this slug, so items without a sheet
    image keep whatever was curated by hand before."""
    for ext in (".webp", ".png", ".jpg", ".jpeg", ".gif"):
        if os.path.exists(os.path.join(IMG_DIR, slug + ext)):
            return slug + ext
    return ""


def _sniff_ext(data):
    if data[:3] == b"\xff\xd8\xff": return ".jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n": return ".png"
    if data[:3] == b"GIF": return ".gif"
    if data[8:12] == b"WEBP": return ".webp"
    return None


def download_images(cart):
    """Resolve every item's photo. Returns (pulled, failed) for the report."""
    os.makedirs(IMG_DIR, exist_ok=True)
    pulled, failed = [], []
    for _cat, items in cart:
        for it in items:
            url = it.get("image_url", "")
            if not url:
                it["img"] = _existing_local(it["slug"])     # keep hand-placed photo / placeholder
                continue
            m = DRIVE_ID_RE.search(url)
            dl = f"https://drive.google.com/uc?export=download&id={m.group(1)}" if m else url
            try:
                req = urllib.request.Request(dl, headers={"User-Agent": "Mozilla/5.0"})
                resp = urllib.request.urlopen(req, timeout=60)
                data = resp.read()
                ct = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            except Exception as e:
                it["img"] = _existing_local(it["slug"]); failed.append((it["piece"], str(e))); continue
            ext = EXT_BY_CT.get(ct) or _sniff_ext(data)
            if not ext:    # got an HTML page (file not public) rather than an image
                it["img"] = _existing_local(it["slug"])
                failed.append((it["piece"], "link isn’t a public image — share it ‘Anyone with the link’"))
                continue
            fname = it["slug"] + ext
            with open(os.path.join(IMG_DIR, fname), "wb") as f:
                f.write(data)
            it["img"] = fname
            pulled.append(it["piece"])
    return pulled, failed


def generate_js(cart):
    lines = ["  const CART = ["]
    for cat, items in cart:
        lines.append(f"    {{ cat: \"{js(cat)}\", items: [")
        for it in items:
            qty = it["qty"]
            flag = f', flag:"{js(it["flag"])}"' if it.get("flag") else ""
            lines.append(
                f"      {{ slug:\"{js(it['slug'])}\", piece:\"{js(it['piece'])}\", "
                f"retailer:\"{js(it['retailer'])}\", size:\"{js(it['size'])}\", "
                f"color:\"{js(it['color'])}\", qty:{qty}, unit:{it['unit']:g}, "
                f"total:{it['total']:g}, link:\"{js(it['link'])}\", img:\"{js(it.get('img',''))}\"{flag} }},"
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
def report(cart, pulled=None, failed=None):
    total = 0.0
    missing = []
    print("\n  Category                       Pieces      Subtotal")
    print("  " + "-" * 52)
    for cat, items in cart:
        sub = sum(it["total"] for it in items)
        total += sub
        print(f"  {cat:<30} {len(items):>5}   ${sub:>11,.2f}")
        for it in items:
            if not it.get("img"):
                missing.append(it["piece"])
    print("  " + "-" * 52)
    n = sum(len(i) for _, i in cart)
    print(f"  {'TOTAL':<30} {n:>5}   ${total:>11,.2f}\n")

    if pulled:
        print(f"  ⬇  Pulled {len(pulled)} photo(s) from the sheet’s IMAGE links.")
    if failed:
        print(f"  ⚠  {len(failed)} image link(s) couldn’t be fetched:")
        for piece, why in failed:
            print(f"      • {piece}  —  {why}")
    if missing:
        print(f"  ⚠  {len(missing)} item(s) have no photo (a placeholder shows): {', '.join(missing)}")
    print("\n  ✓ index.html updated. Preview, then commit & push to publish.\n")


# ── Google Sheet fetch ─────────────────────────────────────────────────────
def looks_like_google(s):
    return "docs.google.com" in s or (s and "/" not in s and "." not in s and len(s) > 20)


def fetch_google_sheet(url_or_id):
    """Download a shared Google Sheet as .xlsx into the local source file.
    The Sheet must be shared 'Anyone with the link: Viewer' (or published)."""
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", url_or_id)
    sheet_id = m.group(1) if m else url_or_id.strip()
    export = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=xlsx"
    print(f"\n  Pulling latest from Google Sheet…")
    try:
        req = urllib.request.Request(export, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=30).read()
    except Exception as e:
        sys.exit(f"  Could not reach the Google Sheet ({e}).\n"
                 f"  Check the link, and that it's shared 'Anyone with the link: Viewer'.")
    if data[:2] != b"PK":   # .xlsx files are zips; HTML login page is not
        sys.exit("  Google returned a login page, not the spreadsheet.\n"
                 "  Set sharing to 'Anyone with the link: Viewer' (or File → Share → Publish to web).")
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, "wb") as f:    # throwaway cache — keeps refreshes from churning git
        f.write(data)
    return CACHE


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    source = arg or GOOGLE_SHEET
    if source and looks_like_google(source):
        path = fetch_google_sheet(source)            # Google Sheet → cached .xlsx
        label = "Google Sheet"
    else:
        path = source or XLSX                        # explicit path, or local file
        label = os.path.relpath(path, REPO)
    if not os.path.exists(path):
        sys.exit(f"Spreadsheet not found: {path}")
    rows = read_sheet(path, SHEET_NAME)
    cart = build_cart(rows)
    if not cart:
        sys.exit("No item rows found — check the sheet name and columns.")
    print("  Fetching product photos from the IMAGE column…")
    pulled, failed = download_images(cart)
    inject(generate_js(cart))
    print(f"\n  Synced from: {label}  (sheet: {SHEET_NAME})")
    report(cart, pulled, failed)
