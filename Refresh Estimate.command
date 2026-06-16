#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────
# Double-click this to pull the latest from the Google Sheet, rebuild the
# estimate page, and publish it to staging. (Nothing reaches the client until
# you run this — it's your deliberate "publish" button.)
# ─────────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1
clear
echo "▶  Refreshing the Room for Two estimate from the Google Sheet…"
echo ""

python3 estimate/sync-from-excel.py || {
  echo ""
  echo "✗  Something went wrong above. Nothing was published."
  read -r -p "Press Return to close."
  exit 1
}

if git diff --quiet -- estimate/index.html; then
  echo "  Nothing changed — the page already matches the Sheet."
else
  git add estimate/index.html
  git commit -m "Refresh estimate from Google Sheet" >/dev/null
  if git push origin staging >/dev/null 2>&1; then
    echo "  ✓  Published to staging. Give Vercel a minute, then check the page."
  else
    echo "  ✗  Couldn't push — check your internet / GitHub access and try again."
  fi
fi

echo ""
read -r -p "All done. Press Return to close."
