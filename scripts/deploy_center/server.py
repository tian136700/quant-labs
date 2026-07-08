#!/usr/bin/env python3
from __future__ import annotations

import json
import mimetypes
import socket
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from datetime import datetime
from urllib.parse import parse_qs, unquote, urlparse

THIS_DIR = Path(__file__).resolve().parent
SCRIPTS_DIR = THIS_DIR.parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from deploy_center.hub import PublishHub
from deploy_center.logger import get_deploy_log, list_deploy_logs

STATIC_DIR = THIS_DIR / "static"
HOST = "127.0.0.1"
PORT = 17823
HUB = PublishHub()
STARTED_AT = datetime.now()


def auto_watch_status() -> dict[str, Any]:
    # Detect the deploy-center service itself on 127.0.0.1:17823.
    service_online = False
    try:
        with socket.create_connection((HOST, PORT), timeout=0.8):
            service_online = True
    except OSError:
        service_online = False
    return {
        "running": service_online,
        "mode": "service",
        "healthy": service_online,
        "service": {
            "host": HOST,
            "port": PORT,
            "url": f"http://{HOST}:{PORT}/",
            "online": service_online,
            "started_at": STARTED_AT.strftime("%Y-%m-%d %H:%M:%S"),
            "checked_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        },
    }


def _latest_deploy_row(mode: str) -> dict[str, Any] | None:
    try:
        rows = list_deploy_logs(limit=200)
    except Exception:
        return None
    for row in rows:
        if row.get("mode") == mode and row.get("status") == "running":
            return row
    for row in rows:
        if row.get("mode") == mode:
            return row
    return None


def auto_runtime_snapshot() -> dict[str, Any]:
    manual = HUB.snapshot()
    if manual.get("status") == "running":
        return {
            "status": "running",
            "step": manual.get("step") or "prepare",
            "progress": int(manual.get("progress") or 0),
            "message": str(manual.get("message") or "自动触发任务进行中"),
            "started_at": manual.get("started_at"),
            "finished_at": manual.get("finished_at"),
            "exit_code": manual.get("exit_code"),
            "logs": manual.get("logs") or [],
            "server_time": manual.get("server_time"),
            "source": "publish-center-job",
        }

    row = _latest_deploy_row("auto")
    status = "idle"
    step = "prepare"
    progress = 0
    started_at = None
    finished_at = None
    exit_code = None
    logs: list[str] = []
    message = "自动部署待命"

    if row:
        status = str(row.get("status") or "idle")
        started_at = row.get("started_at")
        finished_at = row.get("finished_at")
        exit_code = row.get("exit_code")
        if status == "running":
            message = str(row.get("summary") or "自动部署进行中")
        elif status == "success":
            message = str(row.get("summary") or "自动部署成功")
            step, progress = "done", 100
        elif status == "error":
            message = str(row.get("summary") or "自动部署失败")
            step, progress = "done", 100
        else:
            message = str(row.get("summary") or message)

        log_id = row.get("id")
        if isinstance(log_id, int):
            detail_row = get_deploy_log(log_id)
            details = str(detail_row.get("details") or "").splitlines() if detail_row else []
            if details:
                logs = [*details][-600:]

    return {
        "status": status,
        "step": step,
        "progress": progress,
        "message": message,
        "started_at": started_at,
        "finished_at": finished_at,
        "exit_code": exit_code,
        "logs": logs[-500:],
        "server_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": "auto-watch-log",
    }


def _read_static_file(relative_path: str) -> tuple[bytes, str] | None:
    raw = unquote(relative_path).lstrip("/")
    target = (STATIC_DIR / raw).resolve()
    try:
        target.relative_to(STATIC_DIR.resolve())
    except ValueError:
        return None
    if not target.is_file():
        return None
    mime_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    return target.read_bytes(), mime_type


class Handler(BaseHTTPRequestHandler):
    server_version = "DeployCenter/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        if path in ("/", "/index.html"):
            static_result = _read_static_file("index.html")
            if static_result is None:
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            body, content_type = static_result
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", f"{content_type}; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path.startswith("/static/"):
            static_result = _read_static_file(path[len("/static/") :])
            if static_result is None:
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            body, content_type = static_result
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/status":
            self._send_json(HUB.snapshot())
            return
        if path == "/api/auto-status":
            self._send_json({"auto": auto_watch_status(), "manual": HUB.snapshot()})
            return
        if path == "/api/auto-runtime":
            self._send_json(auto_runtime_snapshot())
            return
        if path == "/api/deploy-logs":
            limit = int((query.get("limit") or ["80"])[0] or "80")
            self._send_json({"rows": list_deploy_logs(limit=limit)})
            return
        if path.startswith("/api/deploy-logs/"):
            log_id_text = path.rsplit("/", 1)[-1]
            if not log_id_text.isdigit():
                self._send_json({"ok": False, "error": "invalid log id"}, 400)
                return
            row = get_deploy_log(int(log_id_text))
            if not row:
                self._send_json({"ok": False, "error": "not found"}, 404)
                return
            self._send_json({"ok": True, "row": row})
            return
        if path == "/api/events":
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            q = HUB.subscribe()
            try:
                self.wfile.write(b"data: {\"type\":\"snapshot\"}\n\n")
                self.wfile.flush()
                while True:
                    try:
                        payload = q.get(timeout=25)
                    except Exception:
                        self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
                        continue
                    line = json.dumps(payload, ensure_ascii=False)
                    self.wfile.write(f"data: {line}\n\n".encode("utf-8"))
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                HUB.unsubscribe(q)
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/api/manual/publish":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        body = self._read_json_body()
        message = str(body.get("message", "") or "")
        ok, err = HUB.start(message)
        if not ok:
            self._send_json({"ok": False, "error": err}, 409)
            return
        self._send_json({"ok": True})


def main() -> int:
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}/"
    print(f"[deploy-center] 监听 {url}", flush=True)
    print("[deploy-center] 按 Ctrl+C 停止", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[deploy-center] 已停止", flush=True)
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

