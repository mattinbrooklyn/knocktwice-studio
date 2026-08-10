#!/usr/bin/env python3
"""
sync-expenses.py — rebuild the expense reconciliation page from the expenses Sheet.

WHAT IT DOES
    Reads the client's expenses spreadsheet (a flat ledger of every order
    placed, one row per line item, with the actual per-order charge in the
    ORDER TOTAL column) and regenerates estimate/<client>/expenses/index.html:
    category subtotals plus one order total. No line items on the page.

HOW TO USE
    From the repo root:
        python3 estimate/sync-expenses.py            # roomfortwo
        python3 estimate/sync-expenses.py <client>
    Read the report it prints, preview, then publish (the rendered page goes
    to main on its own — same isolation as the estimate page).

NOTES
    - Pure Python standard library — no pip installs, ever.
    - The Sheet is the source of truth; the page is fully generated.
    - Items bought together share one order: the charge sits on ONE row and
      its siblings carry "-" in ORDER TOTAL. Those rows still belong to the
      order — their cost is inside the charged row's amount — so the report
      flags any RECEIPT group where NO row carries a number (money that would
      otherwise be missing from the total).
    - INCLUDE IN FINAL filters rows (tolerant Yes/Y/TRUE/X/✓/1). If the
      column is missing entirely, everything counts.
    - Config lives in clients/<client>/client.json under "expenses":
      google_sheet, sheet_name, lede, prepared.
"""

import importlib.util, os, sys, urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Reuse the estimate engine's helpers (xlsx reader, config loader, template
# renderer) without duplicating them. Importing runs only constant setup —
# all of its work is main-guarded.
_spec = importlib.util.spec_from_file_location(
    "syncmod", os.path.join(REPO, "estimate", "sync-from-excel.py"))
engine = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(engine)

# Own cache file so refreshing expenses never clobbers the estimate's cache.
CACHE = os.path.join(REPO, "estimate", "_source", ".expenses-cache.xlsx")


def fetch_sheet(url):
    """Download the shared Google Sheet as .xlsx (needs 'Anyone with the
    link: Viewer'). Same approach as the estimate engine, separate cache."""
    import re
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", url)
    sheet_id = m.group(1) if m else url.strip()
    export = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=xlsx"
    print("\n  Pulling latest from the expenses Sheet…")
    try:
        req = urllib.request.Request(export, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=30).read()
    except Exception as e:
        sys.exit(f"  Could not reach the Sheet ({e}).\n"
                 f"  Check the link, and that it's shared 'Anyone with the link: Viewer'.")
    if data[:2] != b"PK":
        sys.exit("  Google returned a login page, not the spreadsheet.\n"
                 "  Set sharing to 'Anyone with the link: Viewer'.")
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, "wb") as f:
        f.write(data)
    return CACHE


def build_summary(rows, category_order, last_categories):
    """Collapse ledger rows into ordered [(category, amount, items)] using the
    numeric ORDER TOTAL cells, plus reconciliation warnings."""
    has_include = any("INCLUDE IN FINAL" in r for r in rows)
    cats = {}          # category -> [amount, item-count]
    receipts = {}      # receipt -> has a numeric ORDER TOTAL somewhere?
    orphans = []       # rows with no charge and no receipt to fold into
    for r in rows:
        piece = (r.get("PIECE") or "").strip()
        cat = (r.get("CATEGORY") or "").strip()
        if not (piece and cat):
            continue
        if has_include and not engine._truthy(r.get("INCLUDE IN FINAL")):
            continue
        amount = engine.num((r.get("ORDER TOTAL") or "").strip())
        receipt = (r.get("RECEIPT") or "").strip()
        cats.setdefault(cat, [0.0, 0])
        cats[cat][1] += 1
        if amount is not None:
            cats[cat][0] += amount
            if receipt and receipt != "-":
                receipts[receipt] = True
        else:
            if receipt and receipt != "-":
                receipts.setdefault(receipt, False)
            else:
                orphans.append(piece)

    # Receipt groups where no row carries a charge = money missing from the total.
    uncharged = sorted(rec for rec, charged in receipts.items() if not charged)

    def rank(cat):
        if cat in last_categories:
            return (2, last_categories.index(cat))
        if cat in category_order:
            return (0, category_order.index(cat))
        return (1, 0)

    ordered = sorted(((c, amt, n) for c, (amt, n) in cats.items()),
                     key=lambda x: rank(x[0]))
    return ordered, uncharged, orphans


def generate_js(summary, deposit):
    lines = ["  const SUMMARY = ["]
    for cat, amount, _n in summary:
        lines.append(f"    {{ cat: \"{engine.js(cat)}\", amount: {amount:.2f} }},")
    lines.append("  ];")
    lines.append(f"  const DEPOSIT = {deposit:.2f};")
    return "\n".join(lines)


if __name__ == "__main__":
    client_id = sys.argv[1] if len(sys.argv) > 1 else "roomfortwo"
    cfg = engine.load_client(client_id)
    exp = cfg.get("expenses")
    if not exp:
        sys.exit(f"clients/{client_id}/client.json has no \"expenses\" block — "
                 f"add google_sheet, sheet_name, lede, and prepared.")

    path = fetch_sheet(exp["google_sheet"])
    rows = engine.read_sheet(path, exp.get("sheet_name", "Sheet1"))
    summary, uncharged, orphans = build_summary(
        rows, cfg.get("category_order", []), cfg.get("last_categories", []))
    if not summary:
        sys.exit("No expense rows found — check the sheet's CATEGORY/PIECE/ORDER TOTAL columns.")

    idn = cfg["identity"]
    deposit = float(exp.get("deposit", 0))
    tokens = {
        "{{eyebrow}}": idn["eyebrow"],
        "{{h1_html}}": idn["h1_html"],
        "{{lede_expenses}}": exp["lede"],
        "{{intro_expenses}}": exp.get("intro", ""),
        "{{sheet_url}}": exp["google_sheet"],
        "{{project_short}}": idn["project_short"],
        "{{expenses_prepared}}": exp["prepared"],
    }
    # The reconciliation gets its own URL (expenses.output_dir); without one it
    # nests under the client's estimate directory.
    out_dir = exp.get("output_dir") or cfg["output_dir"] + "/expenses"
    page = os.path.join(REPO, *out_dir.split("/"), "index.html")
    os.makedirs(os.path.dirname(page), exist_ok=True)
    open(page, "w", encoding="utf-8").write(engine.render_template("expenses.html", tokens))
    engine.inject(page, "/* EXPENSES-DATA:START", "/* EXPENSES-DATA:END",
                  generate_js(summary, deposit))

    total = sum(amt for _c, amt, _n in summary)
    print(f"\n  {'Category':<28}{'Items':>6}{'Charged':>14}")
    print("  " + "-" * 48)
    for cat, amt, n in summary:
        print(f"  {cat:<28}{n:>6}{amt:>14,.2f}")
    print("  " + "-" * 48)
    print(f"  {'COSTS TO DATE':<28}{'':>6}{total:>14,.2f}")
    print(f"  {'DEPOSIT PAID':<28}{'':>6}{-deposit:>14,.2f}")
    label = "BALANCE DUE" if total >= deposit else "CREDIT REMAINING"
    print(f"  {label:<28}{'':>6}{abs(total - deposit):>14,.2f}")
    if uncharged:
        print(f"\n  ⚠  {len(uncharged)} receipt(s) have NO row with an ORDER TOTAL — that money")
        print("     is missing from the page. Put the order's charge on one of its rows:")
        for rec in uncharged:
            print(f"      • {rec}")
    if orphans:
        print(f"\n  ⚠  {len(orphans)} row(s) have no charge and no receipt to fold into: "
              + ", ".join(orphans))
    print(f"\n  ✓ {os.path.relpath(page, REPO)} updated. Preview, then publish.\n")
