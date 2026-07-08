#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from .auto_menu import render_auto_menu
from .hub import PublishHub
from .logger import get_deploy_log, list_deploy_logs
from .logs_menu import render_logs_menu
from .manual_menu import render_manual_menu

ROOT = Path(__file__).resolve().parent.parent.parent
HOST = "127.0.0.1"
PORT = 17823
HUB = PublishHub()


def auto_watch_status() -> dict[str, Any]:
    try:
        proc = subprocess.run(
            ["pgrep", "-fl", "git-auto-push-watch.py"],
            text=True,
            capture_output=True,
        )
        lines = [line for line in proc.stdout.splitlines() if line.strip()]
    except OSError:
        lines = []
    return {
        "running": bool(lines),
        "processes": lines,
    }


def build_page() -> str:
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>部署中心 · strategy-compare-cloud</title>
  <style>
    :root {{ --bg:#0f1419; --panel:#1a2332; --border:#2d3a4f; --text:#e8edf4; --muted:#8b9cb3; --accent:#4f8cff; --ok:#3fb983; --err:#e85d6f; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--bg); color:var(--text); }}
    .wrap {{ max-width:980px; margin:0 auto; padding:1.1rem; }}
    h1 {{ margin:.2rem 0 .8rem; }}
    .tabs {{ display:flex; gap:.5rem; margin-bottom:1rem; flex-wrap:wrap; }}
    .tab {{ border:1px solid var(--border); background:#0d1218; color:var(--muted); padding:.55rem .9rem; border-radius:8px; cursor:pointer; }}
    .tab.active {{ border-color:var(--accent); color:var(--accent); }}
    .view {{ display:none; }} .view.active {{ display:block; }}
    .card {{ background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:1rem 1.1rem; margin-bottom:1rem; }}
    .sub {{ color:var(--muted); margin:.2rem 0 .9rem; font-size:.92rem; }}
    label {{ display:block; margin-bottom:.35rem; color:var(--muted); }}
    input[type="text"] {{ width:100%; padding:.65rem .75rem; border-radius:8px; border:1px solid var(--border); background:#0d1218; color:var(--text); }}
    .btn-row {{ display:flex; gap:.75rem; margin-top:.8rem; flex-wrap:wrap; }}
    button {{ border:none; border-radius:8px; padding:.64rem 1rem; cursor:pointer; font-weight:600; }}
    .btn-primary {{ background:var(--accent); color:#fff; }}
    .btn-ghost {{ background:transparent; color:var(--muted); border:1px solid var(--border); }}
    .progress-track {{ height:10px; background:#0d1218; border-radius:999px; overflow:hidden; margin:.75rem 0 .5rem; }}
    .progress-bar {{ height:100%; width:0%; background:linear-gradient(90deg,var(--accent),#6ea8ff); transition:width .35s ease; }}
    .steps {{ display:flex; gap:.4rem; flex-wrap:wrap; }}
    .step {{ font-size:.75rem; padding:.18rem .5rem; border:1px solid var(--border); color:var(--muted); border-radius:999px; }}
    .step.active {{ color:var(--accent); border-color:var(--accent); }}
    .step.done {{ color:var(--ok); border-color:var(--ok); }}
    .status-line {{ margin-top:.5rem; }}
    .log-box {{ margin:0; height:300px; overflow:auto; white-space:pre-wrap; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.8rem; color:#c5d0e0; }}
    .kv {{ white-space:pre-wrap; line-height:1.55; color:#d2dded; }}
    .logs-list details {{ border:1px solid var(--border); border-radius:8px; padding:.5rem .65rem; margin-bottom:.65rem; background:#0d1218; }}
    .logs-list summary {{ cursor:pointer; color:#d7e4f8; }}
    .logs-detail {{ margin-top:.45rem; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; white-space:pre-wrap; color:#c5d0e0; font-size:.8rem; }}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>部署中心</h1>
    <div class="tabs">
      <button class="tab" data-view="view-manual">手动部署</button>
      <button class="tab active" data-view="view-auto">自动部署</button>
      <button class="tab" data-view="view-logs">部署日志</button>
    </div>
    {render_manual_menu()}
    {render_auto_menu()}
    {render_logs_menu()}
  </div>
  <script>
    const stepOrder = ["prepare","backup","git_add","commit","push","deploy","done"];
    const stepLabels = {{prepare:"准备",backup:"库备份",git_add:"暂存",commit:"提交",push:"推送",deploy:"部署",done:"完成"}};
    const el = (id) => document.getElementById(id);
    const publishBtn = el("publish");
    const msgInput = el("msg");
    const statusEl = el("status");
    const stepsEl = el("steps");
    const barEl = el("bar");
    const logEl = el("manual-log");
    let lastSnapshot = null;

    function bindTabs() {{
      const tabs = Array.from(document.querySelectorAll(".tab"));
      const views = Array.from(document.querySelectorAll(".view"));
      tabs.forEach((tab) => tab.addEventListener("click", () => {{
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const name = tab.getAttribute("data-view");
        views.forEach((v) => v.classList.toggle("active", v.id === name));
      }}));
    }}

    function renderSteps(current, progress, jobStatus) {{
      stepsEl.innerHTML = stepOrder.map((id) => {{
        let cls = "step";
        const idx = stepOrder.indexOf(id);
        const cur = stepOrder.indexOf(current || "prepare");
        if (jobStatus === "success" || idx < cur) cls += " done";
        else if (idx === cur) cls += " active";
        return `<span class="${{cls}}">${{stepLabels[id] || id}}</span>`;
      }}).join("");
      barEl.style.width = `${{Math.max(0, Math.min(100, progress || 0))}}%`;
    }}

    function applySnapshot(data) {{
      lastSnapshot = data;
      renderSteps(data.step, data.progress, data.status);
      if (data.status === "running") {{
        statusEl.textContent = data.message || "手动部署进行中...";
        publishBtn.disabled = true;
      }} else if (data.status === "success") {{
        statusEl.textContent = data.message || "手动部署成功";
        publishBtn.disabled = false;
      }} else if (data.status === "error") {{
        statusEl.textContent = data.message || "手动部署失败";
        publishBtn.disabled = false;
      }} else {{
        statusEl.textContent = "待命";
        publishBtn.disabled = false;
      }}
      if (Array.isArray(data.logs)) {{
        logEl.textContent = data.logs.join("\\n") + (data.logs.length ? "\\n" : "");
        logEl.scrollTop = logEl.scrollHeight;
      }}
    }}

    async function refreshManual() {{
      const data = await (await fetch("/api/status")).json();
      applySnapshot(data);
    }}

    async function refreshAuto() {{
      const data = await (await fetch("/api/auto-status")).json();
      const lines = [
        "自动部署守护进程: " + (data.auto.running ? "运行中" : "未运行"),
        "进程数: " + ((data.auto.processes || []).length),
      ];
      if (Array.isArray(data.auto.processes) && data.auto.processes.length) {{
        lines.push("", "进程详情:");
        lines.push(...data.auto.processes);
      }}
      el("auto-summary").textContent = lines.join("\\n");
      const runtime = data.manual.status === "running"
        ? `当前有部署任务: 是\\n步骤: ${{data.manual.step}}\\n进度: ${{data.manual.progress}}%\\n开始: ${{data.manual.started_at || "-"}}`
        : "当前有部署任务: 否";
      el("auto-runtime").textContent = runtime;
    }}

    function modeLabel(mode) {{
      return mode === "auto" ? "自动部署" : "手动部署";
    }}

    async function refreshLogs() {{
      const data = await (await fetch("/api/deploy-logs?limit=80")).json();
      const wrap = el("logs-list");
      const rows = Array.isArray(data.rows) ? data.rows : [];
      wrap.innerHTML = rows.map((row) => {{
        const title = `${{row.started_at}} · ${{modeLabel(row.mode)}} · ${{row.status}} · #${{row.id}}`;
        const extra = [
          "备注: " + (row.remark || "-"),
          "提交: " + (row.git_commit_short || "-"),
          "分支: " + (row.branch || "-"),
          "摘要: " + (row.summary || "-"),
          "完成: " + (row.finished_at || "-"),
          "退出码: " + (row.exit_code ?? "-"),
        ].join("\\n");
        return `<details data-log-id="${{row.id}}"><summary>${{title}}</summary><div class="logs-detail">${{extra}}\\n\\n点击展开后自动加载详情...</div></details>`;
      }}).join("");
      for (const item of wrap.querySelectorAll("details[data-log-id]")) {{
        item.addEventListener("toggle", async () => {{
          if (!item.open || item.dataset.loaded === "1") return;
          const logId = item.getAttribute("data-log-id");
          const resp = await (await fetch(`/api/deploy-logs/${{logId}}`)).json();
          const d = resp.row || {{}};
          const detail = [
            "部署详情:",
            d.details || "(空)",
          ].join("\\n");
          const box = item.querySelector(".logs-detail");
          if (box) box.textContent = box.textContent + "\\n\\n" + detail;
          item.dataset.loaded = "1";
        }});
      }}
    }}

    publishBtn.addEventListener("click", async () => {{
      const message = (msgInput.value || "").trim();
      const res = await fetch("/api/manual/publish", {{
        method: "POST",
        headers: {{"Content-Type":"application/json"}},
        body: JSON.stringify({{ message }}),
      }});
      const data = await res.json();
      if (!data.ok) {{
        statusEl.textContent = data.error || "启动失败";
        return;
      }}
      await refreshManual();
    }});

    el("refresh").addEventListener("click", () => void refreshManual());
    el("refresh-auto").addEventListener("click", () => void refreshAuto());
    el("refresh-logs").addEventListener("click", () => void refreshLogs());

    const es = new EventSource("/api/events");
    es.onmessage = () => {{
      void refreshManual();
      void refreshAuto();
    }};

    bindTabs();
    refreshManual();
    refreshAuto();
    refreshLogs();
    setInterval(() => {{ void refreshManual(); void refreshAuto(); }}, 5000);
  </script>
</body>
</html>"""


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
            body = build_page().encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
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

