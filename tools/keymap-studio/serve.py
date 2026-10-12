#!/usr/bin/env python3
"""Static server for the studio UI, plus a tiny keymap-file API.

WebSerial needs a secure context, and file:// does not qualify, so the page is
served over http://localhost. Caching is disabled: the ES modules are edited in
place and a stale module is indistinguishable from a bug in the firmware.

The API exists only for combos, which the ZMK Studio RPC does not cover. They
live in the .keymap source, so editing one means editing that file and then
rebuilding and flashing. Exactly one file is reachable, and the socket is bound
to the loopback interface.
"""

import json
import shutil
import subprocess
import sys
import tempfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = (HERE / ".." / "..").resolve()
KEYMAP = (REPO / "config" / "eyelash_corne.keymap").resolve()
MAX_WRITE_BYTES = 512 * 1024

# Firmware artifact names from build.yaml (exact filenames in the CI zip).
FIRMWARE_LEFT = "eyelash_corne_studio_left.uf2"
FIRMWARE_RIGHT = "eyelash_corne_right nice_view-nice_nano_v2-zmk.uf2"
WORKFLOW_NAME = "Build ZMK firmware (vendored)"
# nice_nano_v2 in bootloader mode mounts as a mass-storage volume.
BOOTLOADER_HINTS = ("NICENANO", "NICE_NANO", "CIRCUITPY", "RPI-RP2")


def run(args, timeout=120):
    """Run a command in the repo and return (ok, stdout, stderr)."""
    try:
        done = subprocess.run(
            args, cwd=REPO, capture_output=True, text=True, timeout=timeout, check=False,
        )
    except FileNotFoundError:
        return False, "", f"{args[0]} not installed"
    except subprocess.TimeoutExpired:
        return False, "", f"{args[0]} timed out"
    return done.returncode == 0, done.stdout.strip(), done.stderr.strip()


def bootloader_volume():
    """The mounted bootloader drive, if the keyboard is waiting for firmware."""
    volumes = Path("/Volumes")
    if not volumes.is_dir():
        return None
    for entry in volumes.iterdir():
        name = entry.name.upper().replace(" ", "")
        if any(hint in name for hint in BOOTLOADER_HINTS):
            return entry
    return None


class StudioHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write(f"{self.address_string()}  {fmt % args}\n")

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = self.path.split("?")[0]
        if route == "/api/repo":
            self.api_repo_status()
            return
        if route == "/api/run":
            self.api_run_status()
            return
        if route == "/api/keymap":
            if not KEYMAP.is_file():
                self._json(404, {"error": f"{KEYMAP} not found"})
                return
            self._json(200, {"path": str(KEYMAP), "text": KEYMAP.read_text()})
            return
        super().do_GET()

    def do_POST(self):
        route = self.path.split("?")[0]
        if route == "/api/commit-push":
            self.api_commit_push()
            return
        if route == "/api/flash":
            self.api_flash()
            return
        self._json(404, {"error": "no such endpoint"})

    def do_PUT(self):
        if self.path.split("?")[0] != "/api/keymap":
            self._json(404, {"error": "no such endpoint"})
            return

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_WRITE_BYTES:
            self._json(413, {"error": "missing or oversized body"})
            return

        try:
            payload = json.loads(self.rfile.read(length))
            text = payload["text"]
        except (ValueError, KeyError, TypeError):
            self._json(400, {"error": "expected JSON {\"text\": \"...\"}"})
            return

        if not isinstance(text, str) or "zmk,keymap" not in text:
            # A keymap without its own compatible string is a truncated or
            # wrong payload; refuse rather than clobber the source of truth.
            self._json(400, {"error": "payload does not look like a ZMK keymap"})
            return

        # Write via a sibling temp file so an interrupted write cannot leave
        # the keymap half-written.
        temp = KEYMAP.with_suffix(".keymap.tmp")
        temp.write_text(text)
        temp.replace(KEYMAP)
        self._json(200, {"path": str(KEYMAP), "bytes": len(text)})

    # --- apply pipeline: commit, push, wait for CI, flash ------------------

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_WRITE_BYTES:
            return {}
        try:
            return json.loads(self.rfile.read(length))
        except ValueError:
            return {}

    def api_repo_status(self):
        ok, branch, err = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
        if not ok:
            self._json(500, {"error": err or "not a git repository"})
            return
        _, head, _ = run(["git", "rev-parse", "HEAD"])
        _, changed, _ = run(["git", "status", "--porcelain", "--", str(KEYMAP)])
        _, unpushed, _ = run(["git", "rev-list", "--count", f"origin/{branch}..HEAD"])
        self._json(200, {
            "branch": branch,
            "head": head,
            "keymapDirty": bool(changed),
            "unpushed": int(unpushed) if unpushed.isdigit() else 0,
            "bootloader": str(bootloader_volume() or ""),
        })

    def api_commit_push(self):
        message = (self._body().get("message") or "Update combos via Keymap Studio").strip()
        if not message:
            self._json(400, {"error": "empty commit message"})
            return

        _, branch, _ = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
        if branch in ("HEAD", ""):
            self._json(400, {"error": "detached HEAD; check out a branch first"})
            return

        # Only ever stage the keymap: never sweep up unrelated work.
        ok, _, err = run(["git", "add", "--", str(KEYMAP)])
        if not ok:
            self._json(500, {"error": f"git add failed: {err}"})
            return

        staged_ok, _, _ = run(["git", "diff", "--cached", "--quiet", "--", str(KEYMAP)])
        if staged_ok:
            self._json(400, {"error": "no keymap changes to commit"})
            return

        ok, out, err = run(["git", "commit", "-m", message, "--", str(KEYMAP)])
        if not ok:
            self._json(500, {"error": f"git commit failed: {err or out}"})
            return

        ok, out, err = run(["git", "push", "origin", f"HEAD:{branch}"], timeout=180)
        if not ok:
            self._json(500, {"error": f"git push failed: {err or out}", "hint": "the commit is local; push it yourself or pick another branch"})
            return

        _, head, _ = run(["git", "rev-parse", "HEAD"])
        self._json(200, {"branch": branch, "sha": head, "message": message})

    def api_run_status(self):
        from urllib.parse import parse_qs, urlparse
        sha = parse_qs(urlparse(self.path).query).get("sha", [""])[0]
        if not sha:
            self._json(400, {"error": "missing sha"})
            return

        ok, out, err = run([
            "gh", "run", "list", "--limit", "30", "--json",
            "databaseId,headSha,status,conclusion,workflowName,url,createdAt",
        ])
        if not ok:
            self._json(500, {"error": f"gh run list failed: {err}"})
            return

        runs = [
            r for r in json.loads(out or "[]")
            if r["headSha"] == sha and r["workflowName"] == WORKFLOW_NAME
        ]
        if not runs:
            self._json(200, {"state": "pending", "detail": "no build queued for this commit yet"})
            return

        latest = runs[0]
        self._json(200, {
            "state": latest["status"],
            "conclusion": latest["conclusion"],
            "runId": latest["databaseId"],
            "url": latest["url"],
        })

    def api_flash(self):
        payload = self._body()
        run_id = payload.get("runId")
        half = (payload.get("half") or "left").lower()
        if not run_id:
            self._json(400, {"error": "missing runId"})
            return
        if half not in ("left", "right"):
            self._json(400, {"error": 'half must be "left" or "right"'})
            return

        firmware_name = FIRMWARE_LEFT if half == "left" else FIRMWARE_RIGHT
        half_label = "left" if half == "left" else "right"

        volume = bootloader_volume()
        if volume is None:
            self._json(409, {
                "error": "no bootloader drive mounted",
                "hint": f"double-tap reset on the {half_label} half, then try again",
            })
            return

        with tempfile.TemporaryDirectory() as tmp:
            ok, out, err = run(
                ["gh", "run", "download", str(run_id), "-n", "firmware", "-D", tmp], timeout=300,
            )
            if not ok:
                self._json(500, {"error": f"artifact download failed: {err or out}"})
                return

            firmware = next(
                (p for p in Path(tmp).rglob("*.uf2") if p.name == firmware_name),
                None,
            )
            if firmware is None:
                self._json(500, {"error": f"{firmware_name} not in the artifact"})
                return

            try:
                shutil.copy2(firmware, volume / firmware_name)
            except OSError as exc:
                # The board reboots the moment the write completes, so an
                # error on close is normal and not a failure.
                if "Input/output error" not in str(exc) and "No such file" not in str(exc):
                    self._json(500, {"error": f"copy failed: {exc}"})
                    return

        self._json(200, {"flashed": firmware_name, "half": half, "volume": str(volume)})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8181
    handler = partial(StudioHandler, directory=str(HERE))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"Corne Keymap Studio: http://localhost:{port}/")
    print(f"combos file: {KEYMAP}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
