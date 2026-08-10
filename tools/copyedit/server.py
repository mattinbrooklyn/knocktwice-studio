#!/usr/bin/env python3
"""
Copy Desk — local helper for pushing single copy edits to the live site.

The page collects the current copy and the new copy; this server does what a
careful person at a terminal would do: find the text on origin/main (the live
branch), show a preview, and on confirm make one isolated commit on main plus
a mirror commit on staging so the change never reverts. Pure standard library,
binds to localhost only; closing the launcher window shuts it down.

    python3 tools/copyedit/server.py     # (the .command launcher does this)

Guarantees the page leans on:
  • Zero or multiple matches → hard stop, nothing changes anywhere.
  • The live-site commit touches exactly one file and is built in a throwaway
    worktree of origin/main — the staging checkout is never involved.
  • One publish at a time (a lock, same as the sourcing panel).
"""
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import mimetypes
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOOL_DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(TOOL_DIR))
PAGE = os.path.join(TOOL_DIR, "index.html")

HOST, PORT = "127.0.0.1", 8757
LIVE_ORIGIN = "https://www.knocktwice.studio"

# Only real site pages are editable. Everything else — archive/, tools/,
# estimate pages (generated from Sheets; ktw would overwrite a hand edit),
# skeleton/, templates/ — is off limits on purpose.
EDITABLE = re.compile(
    r"^(index\.html|(about|contact|experiences|home|interiors|shop)/.*\.html)$")

publish_lock = threading.Lock()


# ── git plumbing ──────────────────────────────────────────────────────────

def git(*args, cwd=REPO):
    """Run one git command; return (ok, output). Never raises on failure —
    every caller reports the message instead of crashing the request."""
    try:
        proc = subprocess.run(["git", *args], cwd=cwd, capture_output=True,
                              text=True, timeout=120)
    except subprocess.TimeoutExpired:
        return False, "git took too long — check your internet connection."
    out = ((proc.stdout or "") + (proc.stderr or "")).strip()
    return proc.returncode == 0, out


def live_files():
    """Every editable page on origin/main."""
    ok, out = git("ls-tree", "-r", "origin/main", "--name-only")
    if not ok:
        return []
    return [f for f in out.splitlines() if EDITABLE.match(f)]


def page_url(path):
    """about/index.html → /about/ ; index.html → / ; foo/bar.html → /foo/bar."""
    if path == "index.html":
        return "/"
    if path.endswith("/index.html"):
        return "/" + path[: -len("index.html")]
    return "/" + path[: -len(".html")]


# ── the edit itself ───────────────────────────────────────────────────────

def search_pattern(current):
    """Whitespace-flexible exact match: the pasted copy may wrap differently
    than the source file, but every word and punctuation mark must match."""
    words = current.split()
    if not words:
        return None
    return re.compile(r"\s+".join(re.escape(w) for w in words))


def new_paragraphs(new_copy):
    """The new copy, HTML-escaped, one entry per line (Return = new paragraph)."""
    return [html.escape(line.strip(), quote=False)
            for line in new_copy.splitlines() if line.strip()]


def apply_edit(content, pattern, paragraphs):
    """Replace the (single) match in `content` with the new copy.
    Extra lines become sibling <p> elements after the containing paragraph,
    matching how the site's text blocks are built. Returns (new_content, error).
    """
    matches = list(pattern.finditer(content))
    if len(matches) != 1:
        return None, f"expected exactly one match in the file, found {len(matches)}"
    m = matches[0]
    first = paragraphs[0]

    if len(paragraphs) == 1:
        return content[:m.start()] + first + content[m.end():], None

    # Multi-line new copy: the match must sit inside one <p>…</p> so the extra
    # lines can become clean sibling paragraphs.
    open_p = content.rfind("<p", 0, m.start())
    if open_p == -1 or content.rfind("</p>", 0, m.start()) > open_p:
        return None, ("line breaks are only supported when the current copy "
                      "sits inside a normal paragraph — this text doesn't. "
                      "Bring this one to Claude.")
    close_p = content.find("</p>", m.end())
    next_open = content.find("<p", m.end())
    if close_p == -1 or (next_open != -1 and next_open < close_p):
        return None, ("the current copy spans more than one paragraph — "
                      "bring this one to Claude.")

    line_start = content.rfind("\n", 0, open_p) + 1
    indent = content[line_start:open_p]
    if indent.strip():  # <p> shares its line with other markup — play it safe
        indent = "      "
    insertion = "".join(f"\n{indent}<p>{p}</p>" for p in paragraphs[1:])
    end = close_p + len("</p>")
    return (content[:m.start()] + first + content[m.end():end]
            + insertion + content[end:]), None


def find_matches(current):
    """Search every editable page on origin/main. Returns (matches, error) where
    matches is a list of {file, url, count, content}."""
    pattern = search_pattern(current)
    if pattern is None:
        return None, "Paste the copy as it currently reads on the live site."
    ok, out = git("fetch", "origin", "--quiet")
    if not ok:
        return None, f"Couldn't reach GitHub: {out}"
    results = []
    for path in live_files():
        ok, content = git("show", f"origin/main:{path}")
        if not ok:
            continue
        n = len(pattern.findall(content))
        if n:
            results.append({"file": path, "url": page_url(path),
                            "count": n, "content": content})
    return results, None


def context_snippet(content, pattern, radius=160):
    """A little of the surrounding page text so the match is recognisable."""
    m = pattern.search(content)
    start, end = max(0, m.start() - radius), min(len(content), m.end() + radius)
    snippet = content[start:end]
    snippet = re.sub(r"<[^>]+>", " ", snippet)          # strip tags
    snippet = re.sub(r"\s+", " ", snippet).strip()
    return ("…" if start else "") + snippet + ("…" if end < len(content) else "")


# ── publish ───────────────────────────────────────────────────────────────

def short(text, n=48):
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1] + "…"


def do_publish(current, new_copy, dry_run=False):
    """The whole ceremony. Returns {ok, steps:[{label, ok, note}], file, url}."""
    steps = []

    def step(label, ok, note=""):
        steps.append({"label": label, "ok": ok, "note": note})
        return ok

    pattern = search_pattern(current)
    paragraphs = new_paragraphs(new_copy)
    if pattern is None or not paragraphs:
        return {"ok": False, "steps": [
            {"label": "Check the form", "ok": False,
             "note": "Both boxes need text."}]}

    # Re-find at publish time — the site may have changed since the preview.
    matches, err = find_matches(current)
    if err:
        step("Look up the live site", False, err)
        return {"ok": False, "steps": steps}
    total = sum(m["count"] for m in matches)
    if total != 1:
        step("Confirm a single match", False,
             f"Found {total} matches — nothing was changed. "
             "Add more surrounding text to make the copy unique.")
        return {"ok": False, "steps": steps}
    target = matches[0]
    path = target["file"]
    step("Confirm a single match", True, f"{path}")

    edited, err = apply_edit(target["content"], pattern, paragraphs)
    if err:
        step("Prepare the edit", False, err)
        return {"ok": False, "steps": steps}
    step("Prepare the edit", True)

    page_label = "Home" if path == "index.html" else \
        path.split("/", 1)[0].capitalize()
    message = (f'{page_label}: copy edit (live)\n\n'
               f'"{short(current)}" → "{short(new_copy)}"')

    # One isolated commit on main, built in a throwaway worktree.
    tmp = tempfile.mkdtemp(prefix="ktw-copyedit-")
    try:
        ok, out = git("worktree", "add", "--detach", tmp, "origin/main")
        if not step("Check out the live branch", ok, "" if ok else out):
            return {"ok": False, "steps": steps}
        with open(os.path.join(tmp, path), "w", encoding="utf-8") as f:
            f.write(edited)
        ok1, out1 = git("add", path, cwd=tmp)
        ok2, out2 = git("commit", "-m", message, cwd=tmp)
        if not step("Commit the change", ok1 and ok2,
                    "" if ok1 and ok2 else out1 + "\n" + out2):
            return {"ok": False, "steps": steps}
        if dry_run:
            step("Push to the live site", True, "(dry run — nothing pushed)")
        else:
            ok, out = git("push", "origin", "HEAD:main", cwd=tmp)
            if not step("Push to the live site", ok, "" if ok else out):
                return {"ok": False, "steps": steps}
    finally:
        git("worktree", "remove", "--force", tmp)
        shutil.rmtree(tmp, ignore_errors=True)

    # Mirror on staging so the edit never reverts when staging next ships.
    # Every guard here degrades to "skipped, tell Claude" — the live push above
    # already succeeded, so nothing below may fail the publish.
    mirror_note = mirror_to_staging(pattern, paragraphs, path, message, dry_run)
    step("Mirror the edit on staging", not mirror_note.startswith("Skipped"),
         mirror_note)

    live_ok = all(s["ok"] for s in steps if s["label"] != "Mirror the edit on staging")
    return {"ok": live_ok, "steps": steps, "file": path,
            "url": page_url(path), "needle": paragraphs[0]}


def mirror_to_staging(pattern, paragraphs, path, message, dry_run):
    """Apply the same edit to the local staging checkout and push. Best-effort:
    any surprise means skip with a human-readable note, never a half-commit."""
    if dry_run:
        return "(dry run — staging untouched)"
    ok, branch = git("rev-parse", "--abbrev-ref", "HEAD")
    if not ok or branch != "staging":
        return f"Skipped — this checkout is on '{branch}', not staging."
    ok, dirty = git("status", "--porcelain", "--", path)
    if not ok or dirty:
        return (f"Skipped — {path} has uncommitted local edits. "
                "Mention it to Claude so the copy doesn't revert later.")
    full = os.path.join(REPO, path)
    try:
        with open(full, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return f"Skipped — couldn't read {path} in this checkout."
    edited, err = apply_edit(content, pattern, paragraphs)
    if err:
        return (f"Skipped — staging's copy differs ({err}). "
                "Mention it to Claude so the copy doesn't revert later.")
    with open(full, "w", encoding="utf-8") as f:
        f.write(edited)
    ok1, _ = git("add", path)
    ok2, out = git("commit", "-m", message + "\n\n(mirror of live edit)")
    if not (ok1 and ok2):
        git("checkout", "--", path)  # leave the checkout as we found it
        return f"Skipped — commit failed: {out}"
    ok, out = git("push", "origin", "staging")
    if not ok:
        return ("Committed locally, but the push was rejected (GitHub's staging "
                "has newer commits). Ask Claude to rebase and push next session.")
    return "Done — staging carries the same copy."


def verify_live(url, needle):
    """Is the new copy visible on the live page yet?"""
    try:
        with urllib.request.urlopen(LIVE_ORIGIN + url, timeout=15) as resp:
            body = resp.read().decode("utf-8", "replace")
    except OSError:
        return False
    return needle in body


# ── HTTP ──────────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body)
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass

    def _body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            return json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return None

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path in ("/", "/index.html"):
            with open(PAGE, "rb") as f:
                return self._send(200, f.read(), "text/html; charset=utf-8")
        if path == "/api/verify":
            params = dict(p.split("=", 1) for p in query.split("&") if "=" in p)
            url = urllib.parse.unquote(params.get("url", "/"))
            needle = urllib.parse.unquote_plus(params.get("needle", ""))
            if not url.startswith("/") or "//" in url:
                return self._send(400, {"error": "bad url"})
            return self._send(200, {"live": verify_live(url, needle)})
        if path.startswith("/assets/"):
            return self._serve_asset(path)
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        route = self.path.split("?", 1)[0]
        body = self._body()
        if body is None:
            return self._send(400, {"error": "Couldn't read the request."})
        current = (body.get("current") or "").strip()
        new_copy = (body.get("new") or "").strip()

        if route == "/api/find":
            if not current or not new_copy:
                return self._send(200, {"ok": False,
                    "error": "Fill in both boxes first."})
            matches, err = find_matches(current)
            if err:
                return self._send(200, {"ok": False, "error": err})
            total = sum(m["count"] for m in matches)
            if total == 0:
                return self._send(200, {"ok": False, "error":
                    "That copy isn't on any live page. Check it matches the "
                    "site word for word — or it may live somewhere this tool "
                    "doesn't edit (bring those to Claude)."})
            if total > 1:
                where = ", ".join(f"{m['url']} (×{m['count']})" for m in matches)
                return self._send(200, {"ok": False, "error":
                    f"That copy appears {total} times ({where}). Paste a longer "
                    "stretch of it so there's exactly one match."})
            target = matches[0]
            pattern = search_pattern(current)
            paragraphs = new_paragraphs(new_copy)
            _, err = apply_edit(target["content"], pattern, paragraphs)
            if err:
                return self._send(200, {"ok": False, "error":
                    f"Found it on {target['url']}, but: {err}"})
            return self._send(200, {
                "ok": True, "file": target["file"], "url": target["url"],
                "context": context_snippet(target["content"], pattern),
                "preview_new": paragraphs})

        if route == "/api/publish":
            with publish_lock:
                result = do_publish(current, new_copy,
                                    dry_run=bool(body.get("dry_run")))
            return self._send(200, result)

        return self._send(404, {"error": "not found"})

    def _serve_asset(self, path):
        rel = path.lstrip("/")
        full = os.path.normpath(os.path.join(REPO, rel))
        if not full.startswith(REPO + os.sep) or not os.path.isfile(full):
            return self._send(404, {"error": "not found"})
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        with open(full, "rb") as f:
            return self._send(200, f.read(), ctype)


def main():
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError:
        sys.exit(f"✗  Port {PORT} is already in use — Copy Desk may already be "
                 f"open.\n   Close any other Copy Desk window and try again.")
    print(f"  Copy Desk running at http://{HOST}:{PORT}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
