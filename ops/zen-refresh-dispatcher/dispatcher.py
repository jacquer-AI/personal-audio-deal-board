#!/usr/bin/env python3
import json
import logging
import os
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = int(os.environ.get("AUDIO_REFRESH_PORT", "8787"))
REPO = "jacquer-AI/personal-audio-deal-board"
WORKFLOW = "refresh-market.yml"
ALLOWED_ORIGIN = "https://jacquer-ai.github.io"
ALLOWED_LOGIN = os.environ.get("AUDIO_REFRESH_TAILSCALE_LOGIN", "jacquer-AI@github")
GH = os.environ.get("AUDIO_REFRESH_GH", r"C:\Program Files\GitHub CLI\gh.exe")
VALID_MODES = {"quick", "full", "deep"}
VALID_CATEGORIES = {"all", "IEM", "TWS", "Closed", "Głośniki BT"}
MAX_BODY = 4096
COOLDOWN_SECONDS = 30

ROOT = Path(__file__).resolve().parent
LOG_PATH = ROOT / "dispatcher.log"
logging.basicConfig(
    filename=LOG_PATH,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    encoding="utf-8",
)
log = logging.getLogger("audio-refresh-dispatcher")

dispatch_lock = threading.Lock()
last_dispatch_at = 0.0


def run_gh(args, timeout=25):
    cmd = [GH] + args
    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=timeout,
        shell=False,
        encoding="utf-8",
        errors="replace",
    )
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()


def latest_run():
    code, out, err = run_gh(
        [
            "api",
            f"repos/{REPO}/actions/workflows/{WORKFLOW}/runs?per_page=1",
            "--jq",
            ".workflow_runs[0] | {id,status,conclusion,html_url,created_at,updated_at,event,display_title}",
        ]
    )
    if code != 0:
        raise RuntimeError(f"gh api failed ({code}): {err[:200]}")
    if not out or out == "null":
        return None
    return json.loads(out)


def normalize_path(path):
    p = urlparse(path).path.rstrip("/") or "/"
    prefix = "/audio-refresh"
    if p == prefix:
        return "/"
    if p.startswith(prefix + "/"):
        p = p[len(prefix):]
        return p or "/"
    return p


class Handler(BaseHTTPRequestHandler):
    server_version = "AudioRefreshDispatcher/1.0"

    def log_message(self, fmt, *args):
        log.info("%s %s", self.address_string(), fmt % args)

    def _origin(self):
        return self.headers.get("Origin", "")

    def _cors(self):
        origin = self._origin()
        if origin == ALLOWED_ORIGIN:
            self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
            self.send_header("Vary", "Origin")

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _origin_ok(self):
        origin = self._origin()
        return origin in ("", ALLOWED_ORIGIN)

    def _identity_ok(self):
        # Direct localhost probes have no Origin and are allowed for diagnostics.
        if not self._origin():
            return self.client_address[0] in ("127.0.0.1", "::1")
        login = self.headers.get("Tailscale-User-Login", "")
        return login.lower() == ALLOWED_LOGIN.lower()

    def do_OPTIONS(self):
        if self._origin() != ALLOWED_ORIGIN:
            self._json(403, {"ok": False, "error": "origin_not_allowed"})
            return
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self):
        path = normalize_path(self.path)
        if not self._origin_ok():
            self._json(403, {"ok": False, "error": "origin_not_allowed"})
            return
        if path == "/health":
            self._json(200, {
                "ok": True,
                "service": "personal-audio-refresh-dispatcher",
                "repo": REPO,
                "tailnetOnly": True,
            })
            return
        if path == "/status":
            if not self._identity_ok():
                self._json(401, {"ok": False, "error": "tailscale_identity_required"})
                return
            try:
                run = latest_run()
                self._json(200, {"ok": True, "run": run})
            except Exception as exc:
                log.exception("status failed")
                self._json(502, {"ok": False, "error": str(exc)[:240]})
            return
        self._json(404, {"ok": False, "error": "not_found"})

    def do_POST(self):
        global last_dispatch_at
        path = normalize_path(self.path)
        if path != "/refresh":
            self._json(404, {"ok": False, "error": "not_found"})
            return
        if self._origin() != ALLOWED_ORIGIN:
            self._json(403, {"ok": False, "error": "origin_not_allowed"})
            return
        if not self._identity_ok():
            self._json(401, {"ok": False, "error": "tailscale_identity_required"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self._json(413, {"ok": False, "error": "invalid_body_size"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._json(400, {"ok": False, "error": "invalid_json"})
            return

        mode = str(payload.get("mode", "")).strip()
        categories = str(payload.get("categories", "")).strip()
        if mode not in VALID_MODES or categories not in VALID_CATEGORIES:
            self._json(400, {"ok": False, "error": "invalid_request"})
            return

        if not dispatch_lock.acquire(blocking=False):
            self._json(409, {"ok": False, "error": "dispatch_busy"})
            return
        try:
            now = time.monotonic()
            if now - last_dispatch_at < COOLDOWN_SECONDS:
                self._json(429, {"ok": False, "error": "cooldown"})
                return

            try:
                current = latest_run()
            except Exception:
                current = None
            if current and current.get("status") in {"queued", "in_progress", "waiting", "pending", "requested"}:
                self._json(409, {"ok": False, "error": "refresh_already_running", "run": current})
                return

            code, out, err = run_gh(
                [
                    "workflow",
                    "run",
                    WORKFLOW,
                    "--repo",
                    REPO,
                    "--ref",
                    "main",
                    "-f",
                    f"mode={mode}",
                    "-f",
                    f"categories={categories}",
                ]
            )
            if code != 0:
                log.error("dispatch failed code=%s stderr=%s", code, err[:300])
                self._json(502, {"ok": False, "error": "github_dispatch_failed"})
                return
            last_dispatch_at = time.monotonic()
            log.info("dispatch queued mode=%s categories=%s", mode, categories)

            run = None
            deadline = time.time() + 8
            while time.time() < deadline:
                time.sleep(1)
                try:
                    candidate = latest_run()
                except Exception:
                    candidate = None
                if candidate and candidate.get("event") == "workflow_dispatch":
                    run = candidate
                    break

            self._json(202, {"ok": True, "queued": True, "mode": mode, "categories": categories, "run": run})
        finally:
            dispatch_lock.release()


def main():
    if not Path(GH).exists():
        raise SystemExit(f"GitHub CLI not found: {GH}")
    code, _, _ = run_gh(["auth", "status", "-h", "github.com"], timeout=15)
    if code != 0:
        raise SystemExit("GitHub CLI is not authenticated")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    log.info("dispatcher starting host=%s port=%s repo=%s", HOST, PORT, REPO)
    server.serve_forever(poll_interval=0.5)


if __name__ == "__main__":
    main()
