#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────
# Double-click this to generate a polished, print-ready PDF of the
# "Room for Two" Final Selections page — straight to your Desktop.
#
#   Refresh the estimate first (so the Final page is current) → double-click
#   this → Room-for-Two-Final.pdf appears on your Desktop, ready to email.
#
# How it works (no InDesign, no manual Cmd+P): it renders the same web page
# you already designed, using headless Google Chrome, into a real PDF. To keep
# the file small enough to email, it first makes downscaled copies of the
# product photos (the page loads those when the URL carries "?pdf").
#
# Requirements: Google Chrome, and macOS's built-in `sips` (always present).
# ─────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")" || exit 1
clear

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SRC_IMG="assets/images/estimate"
PDF_IMG="assets/images/estimate-pdf"     # downscaled copies (gitignored)
PAGE_PATH="estimate/roomfortwo/final/?pdf=1"
OUT="$HOME/Desktop/Room-for-Two-Final.pdf"
PORT=8799
MAX_PX=260                                # longest edge; photos render ~34px

if [ ! -x "$CHROME" ]; then
  echo "✗  Google Chrome isn't at the expected location."
  echo "   Install Chrome (or tell Claude where it lives) and try again."
  read -r -p "Press Return to close."; exit 1
fi

echo "▶  Building the Final Selections PDF…"
echo ""

# 1) Downscale the product photos into the PDF image folder (skip SVG icons).
echo "  ⬇  Preparing lightweight photo copies…"
mkdir -p "$PDF_IMG"
shopt -s nullglob
for f in "$SRC_IMG"/*.png "$SRC_IMG"/*.jpg "$SRC_IMG"/*.jpeg "$SRC_IMG"/*.gif "$SRC_IMG"/*.webp; do
  base="$(basename "$f")"
  # -Z downscales to MAX_PX on the longest edge (never upscales), keeps format.
  sips -Z "$MAX_PX" "$f" --out "$PDF_IMG/$base" >/dev/null 2>&1
done
shopt -u nullglob

# 2) Serve the repo locally so the page's absolute /assets paths resolve.
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT

# Wait for the server to answer (up to ~5s).
for _ in $(seq 1 25); do
  if curl -s -o /dev/null "http://localhost:$PORT/"; then break; fi
  sleep 0.2
done

# 3) Render the Final page to PDF (no browser headers/footers).
echo "  🖨  Rendering the PDF…"
rm -f "$OUT"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=20000 \
  --print-to-pdf="$OUT" \
  "http://localhost:$PORT/$PAGE_PATH" >/dev/null 2>&1

# 4) Report + open.
if [ -f "$OUT" ]; then
  SIZE="$(du -h "$OUT" | cut -f1 | tr -d ' ')"
  echo ""
  echo "  ✓  Saved to your Desktop:  Room-for-Two-Final.pdf  ($SIZE)"
  echo "     Opening it now…"
  open "$OUT"
else
  echo ""
  echo "  ✗  Something went wrong — the PDF wasn't created. Try again, or ask Claude."
fi

echo ""
read -r -p "All done. Press Return to close."
