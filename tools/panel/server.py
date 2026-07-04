#!/usr/bin/env python3
"""
Sourcing & Procurement panel — tiny local helper server.

A browser can't run terminal commands, so this stdlib http.server sits between
the control-panel page and the `ktw` CLI: the page asks it to run a command, it
runs `ktw <command> <client>` and hands the output back. Pure standard library —
no installs. Binds to localhost only; closing the launcher window shuts it down.

    python3 tools/panel/server.py     # (the .command launcher does this for you)
"""
import os, sys, re, json, threading, mimetypes, subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PANEL_DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(PANEL_DIR))
CLIENTS_DIR = os.path.join(REPO, "clients")
KTW = os.path.join(REPO, "tools", "ktw")
PAGE = os.path.join(PANEL_DIR, "index.html")

HOST, PORT = "127.0.0.1", 8756

# Only these four commands may ever run — nothing else reaches a shell, and
# arguments are passed as a list (never interpolated), so nothing is injectable.
ALLOWED = {"new", "refresh", "pdf", "publish"}
NEW_CLIENT_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")   # ids ktw new will accept

# One ktw run at a time — the site's live-deploy plumbing must never overlap.
run_lock = threading.Lock()


def list_clients():
    """Every folder under clients/ that has a client.json — the picker's source
    and the allow-list every action (except 'new') is validated against."""
    if not os.path.isdir(CLIENTS_DIR):
        return []
    out = []
    for name in sorted(os.listdir(CLIENTS_DIR)):
        if os.path.exists(os.path.join(CLIENTS_DIR, name, "client.json")):
            out.append(name)
    return out


def client_details():
    """The picker's data, enriched with each client's human project name so the
    panel can say 'Room for Two' rather than 'roomfortwo'."""
    out = []
    for cid in list_clients():
        label = cid
        try:
            with open(os.path.join(CLIENTS_DIR, cid, "client.json"),
                      encoding="utf-8") as f:
                cfg = json.load(f)
            label = (cfg.get("identity") or {}).get("project") or cid
        except (OSError, ValueError):
            pass  # a malformed config just falls back to the folder name
        out.append({"id": cid, "label": label})
    return out


def run_ktw(command, client, dry_run=False):
    """Run one ktw command and capture everything it prints. Returns a dict the
    page can render: ok, the exit code, and the combined output text."""
    args = [sys.executable, KTW, command, client]
    if command == "publish" and dry_run:
        args.append("--dry-run")
    with run_lock:
        proc = subprocess.run(args, cwd=REPO, capture_output=True, text=True,
                              timeout=600)
    output = (proc.stdout or "") + (proc.stderr or "")
    return {"ok": proc.returncode == 0, "code": proc.returncode,
            "output": output.strip() or "(no output)"}


class Handler(BaseHTTPRequestHandler):
    # ── plumbing ──────────────────────────────────────────────────────────
    def _send(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body)
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        # Never let the browser serve a stale panel — always fetch the live file.
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass  # keep the launcher window quiet

    # ── routes ────────────────────────────────────────────────────────────
    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            with open(PAGE, "rb") as f:
                return self._send(200, f.read(), "text/html; charset=utf-8")
        if path == "/api/clients":
            return self._send(200, {"clients": client_details()})
        if path.startswith("/assets/"):
            return self._serve_asset(path)
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/run":
            return self._send(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._send(400, {"error": "Couldn't read the request."})

        command = body.get("command")
        client = (body.get("client") or "").strip()
        dry_run = bool(body.get("dry_run"))

        if command not in ALLOWED:
            return self._send(400, {"error": "Unknown action."})

        # A brand-new client won't exist yet — validate its shape. Every other
        # action must name a client that already exists on disk.
        if command == "new":
            if not NEW_CLIENT_RE.match(client):
                return self._send(400, {"error":
                    "Use a short lowercase name — letters, numbers and dashes only "
                    "(e.g. \"smithhouse\")."})
        elif client not in list_clients():
            return self._send(400, {"error": "Pick a client first."})

        try:
            result = run_ktw(command, client, dry_run=dry_run)
        except subprocess.TimeoutExpired:
            return self._send(200, {"ok": False, "code": -1,
                "output": "That took too long and was stopped. Nothing was pushed — "
                          "check your internet and try again."})
        return self._send(200, result)

    # ── static assets (so the page can link the real design system) ───────
    def _serve_asset(self, path):
        # Resolve inside the repo and refuse anything that escapes it.
        rel = path.lstrip("/")
        full = os.path.normpath(os.path.join(REPO, rel))
        if not full.startswith(REPO + os.sep) or not os.path.isfile(full):
            return self._send(404, {"error": "not found"})
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        with open(full, "rb") as f:
            return self._send(200, f.read(), ctype)


def main():
    # The launcher script opens the browser once this is answering. If the port
    # is taken (another panel already open), fail with a plain line, not a trace.
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError:
        sys.exit(f"✗  Port {PORT} is already in use — a panel may already be open.\n"
                 f"   Close any other panel window, wait a moment, and try again.")
    print(f"  Sourcing & Procurement panel running at http://{HOST}:{PORT}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
