#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────
# Double-click this to open the Sourcing & Procurement panel.
#
# It starts a tiny local helper, waits for it to be ready, then opens the panel
# in your browser. Leave this window open while you work. When you're done, just
# CLOSE THIS WINDOW (or press Control-C) — that shuts the helper down. Nothing
# keeps running in the background.
# ─────────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1
clear

PORT=8756
URL="http://127.0.0.1:${PORT}/"

echo "Starting the Sourcing & Procurement panel…"

# Start the helper in the background; remember its PID so we can shut it down.
python3 tools/panel/server.py &
SERVER_PID=$!

# Make sure the helper always dies with this window (close it, or Control-C).
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT INT TERM HUP

# Wait until the helper actually answers before opening the browser — this
# avoids the "can't connect" flash you get if the page opens a beat too early.
opened=""
for _ in $(seq 1 40); do
  if curl -s -o /dev/null "$URL"; then
    open "$URL"
    opened="yes"
    break
  fi
  # If the helper stopped (e.g. the port was busy), don't keep waiting.
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    break
  fi
  sleep 0.25
done

if [ -z "$opened" ]; then
  echo ""
  echo "✗  The panel couldn't start — see the message above."
  echo "   (Usually: a panel is already open, or you're offline.)"
  echo ""
  read -r -p "Press Return to close."
  exit 1
fi

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "  The panel is open in your browser."
echo "  Leave this window open while you work. Close it (or press"
echo "  Control-C) when you're done — that shuts the helper down."
echo "─────────────────────────────────────────────────────────────"

# Keep running until the helper exits or this window is closed.
wait "$SERVER_PID"
