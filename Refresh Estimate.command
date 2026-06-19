#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────
# Double-click this to pull the latest from the Google Sheet, rebuild the
# estimate page, and publish it to BOTH the staging preview and the live site
# (knocktwice.studio/estimate/roomfortwo).
#
#   Edit the Google Sheet  →  double-click this  →  preview + live both update.
#
# Only the estimate page is promoted to live — never the rest of the in-progress
# rebuild that also lives on staging. The live update uses git "plumbing", so it
# never switches branches or touches your working files (safe no matter what).
# ─────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")" || exit 1
clear

PREVIEW_BRANCH="staging"   # the working / preview branch
LIVE_BRANCH="main"         # what knocktwice.studio serves
ESTIMATE_PATHS=(estimate/roomfortwo/index.html assets/images/estimate)

echo "▶  Refreshing the Room for Two estimate from the Google Sheet…"
echo ""

# 1) Pull the Sheet and rebuild the page (also downloads any new photos).
python3 estimate/sync-from-excel.py || {
  echo ""; echo "✗  Something went wrong above. Nothing was published."
  read -r -p "Press Return to close."; exit 1
}

# Safety: this must run from the preview branch.
CURRENT=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT" != "$PREVIEW_BRANCH" ]; then
  echo ""; echo "✗  You're on branch '$CURRENT', not '$PREVIEW_BRANCH'."
  echo "   Switch to $PREVIEW_BRANCH (or ask Claude) and try again — nothing was published."
  read -r -p "Press Return to close."; exit 1
fi

# 2) Stage only the estimate page + its images, and commit if anything changed.
git add "${ESTIMATE_PATHS[@]}"
if git diff --cached --quiet; then
  echo "  Nothing changed — the page already matches the Sheet."
  echo ""; read -r -p "All done. Press Return to close."; exit 0
fi
git commit -m "Refresh estimate from Google Sheet" >/dev/null

# 3) Publish to the staging preview.
if git push origin "$PREVIEW_BRANCH" >/dev/null 2>&1; then
  echo "  ✓  Updated the staging preview."
else
  echo "  ✗  Couldn't push to $PREVIEW_BRANCH — check your internet / GitHub access."
  read -r -p "Press Return to close."; exit 1
fi

# 4) Promote ONLY the estimate page to the live site, using plumbing: build a
#    commit = (current live tree) with just the estimate paths swapped in from
#    the commit we just made, then push it. No branch switch, no working-tree
#    changes — so unfinished rebuild work on staging can never leak to live.
echo "  ⏳  Publishing to the live site…"
if ! git fetch origin --quiet; then
  echo "  ✗  Couldn't reach the live site (staging is updated). Try again, or ask Claude."
  echo ""; read -r -p "All done. Press Return to close."; exit 0
fi

MAIN_COMMIT=$(git rev-parse "origin/$LIVE_BRANCH")
TMP_INDEX="$(mktemp)"
if GIT_INDEX_FILE="$TMP_INDEX" git read-tree "$MAIN_COMMIT" \
   && GIT_INDEX_FILE="$TMP_INDEX" git rm -r --cached --quiet --ignore-unmatch estimate/roomfortwo assets/images/estimate \
   && GIT_INDEX_FILE="$TMP_INDEX" git read-tree --prefix=estimate/roomfortwo/ "HEAD:estimate/roomfortwo" \
   && GIT_INDEX_FILE="$TMP_INDEX" git read-tree --prefix=assets/images/estimate/ "HEAD:assets/images/estimate"; then
  NEW_TREE=$(GIT_INDEX_FILE="$TMP_INDEX" git write-tree)
  rm -f "$TMP_INDEX"
  if [ "$NEW_TREE" = "$(git rev-parse "$MAIN_COMMIT^{tree}")" ]; then
    echo "  ✓  Live already matched the preview."
  else
    NEW_COMMIT=$(git commit-tree "$NEW_TREE" -p "$MAIN_COMMIT" -m "Refresh estimate (live)")
    if git push origin "$NEW_COMMIT:refs/heads/$LIVE_BRANCH" >/dev/null 2>&1; then
      echo "  ✓  Published to the live site. Give Vercel a minute, then check the page."
    else
      echo "  ✗  Couldn't publish live (staging is updated). Try again, or ask Claude."
    fi
  fi
else
  rm -f "$TMP_INDEX"
  echo "  ✗  Couldn't prepare the live update (staging is updated). Try again, or ask Claude."
fi

echo ""
read -r -p "All done. Press Return to close."
