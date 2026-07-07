#!/usr/bin/env python3
"""本地发布控制台：一键 Git 提交 + 推送 + Cloudflare 部署，带日志与进度。"""

from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from git_commit_message import summarize_worktree_commit_message

QUICK_COMMIT = ROOT / "git-quick-commit.py"
HOST = os.environ.get("PUBLISH_CONSOLE_HOST", "127.0.0.1")
PORT = int(os.environ.get("PUBLISH_CONSOLE_PORT", "17823"))

STEPS = [
    ("prepare", "准备"),
    ("git_add", "暂存改动"),
    ("commit", "提交"),
    ("push", "推送到 Git"),
    ("deploy", "部署到 Cloudflare"),
    ("done", "完成"),
]


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


@dataclass
class JobState:
    status: str = "idle"  # idle | running | success | error
    step: str = "prepare"
    progress: int = 0
    message: str = ""
    started_at: str | None = None
    finished_at: str | None = None
    exit_code: int | None = None
    logs: list[str] = field(default_factory=list)


class PublishHub:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._job = JobState()
        self._subscribers: list[queue.Queue[str]] = []
        self._thread: threading.Thread | None = None

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "status": self._job.status,
                "step": self._job.step,
                "progress": self._job.progress,
                "message": self._job.message,
                "started_at": self._job.started_at,
                "finished_at": self._job.finished_at,
                "exit_code": self._job.exit_code,
                "steps": [{"id": s[0], "label": s[1]} for s in STEPS],
                "logs": self._job.logs[-400:],
                "url": f"http://{HOST}:{PORT}/",
            }

    def subscribe(self) -> queue.Queue[str]:
        q: queue.Queue[str] = queue.Queue()
        with self._lock:
            self._subscribers.append(q)
        return q

    def _broadcast(self, payload: dict[str, Any]) -> None:
        line = json.dumps(payload, ensure_ascii=False)
        dead: list[queue.Queue[str]] = []
        for sub in self._subscribers:
            try:
                sub.put_nowait(line)
            except queue.Full:
                dead.append(sub)
        if dead:
            with self._lock:
                for sub in dead:
                    if sub in self._subscribers:
                        self._subscribers.remove(sub)

    def _set_step(self, step_id: str, progress: int, message: str = "") -> None:
        with self._lock:
            self._job.step = step_id
            self._job.progress = progress
            if message:
                self._job.message = message
        self._broadcast(
            {
                "type": "progress",
                "step": step_id,
                "progress": progress,
                "message": message,
                "status": self._job.status,
            }
        )

    def _append_log(self, text: str) -> None:
        text = text.rstrip("\n")
        if not text:
            return
        with self._lock:
            self._job.logs.append(text)
            if len(self._job.logs) > 2000:
                self._job.logs = self._job.logs[-1500:]
        self._broadcast({"type": "log", "line": text})

    def _infer_step(self, line: str) -> None:
        lower = line.lower()
        if "git add" in lower:
            self._set_step("git_add", 20, "正在暂存文件…")
        elif "committed:" in lower:
            self._set_step("commit", 40, "已创建提交")
        elif "pushed to origin" in lower:
            self._set_step("push", 60, "已推送到远程仓库")
        elif "npm run deploy" in lower:
            self._set_step("deploy", 75, "正在构建并部署…")
        elif "deploy finished" in lower:
            self._set_step("deploy", 95, "部署命令已完成")
        elif "没有可提交的改动" in line:
            self._set_step("prepare", 10, "没有本地改动，将尝试直接部署")

    def start(self, commit_message: str = "") -> tuple[bool, str]:
        with self._lock:
            if self._job.status == "running":
                return False, "已有发布任务在进行中"
            self._job = JobState(
                status="running",
                step="prepare",
                progress=5,
                message="任务已启动",
                started_at=now_str(),
                logs=[f"[{now_str()}] 发布任务开始"],
            )
            self._thread = threading.Thread(
                target=self._run_job,
                args=(commit_message.strip(),),
                daemon=True,
            )
            self._thread.start()
        self._broadcast({"type": "started", "started_at": self._job.started_at})
        return True, "ok"

    def _finish(self, exit_code: int, message: str) -> None:
        with self._lock:
            self._job.exit_code = exit_code
            self._job.finished_at = now_str()
            self._job.status = "success" if exit_code == 0 else "error"
            self._job.message = message
            if exit_code == 0:
                self._job.step = "done"
                self._job.progress = 100
        self._broadcast(
            {
                "type": "finished",
                "status": self._job.status,
                "exit_code": exit_code,
                "message": message,
                "finished_at": self._job.finished_at,
                "progress": self._job.progress,
                "step": self._job.step,
            }
        )

    def _run_job(self, commit_message: str) -> None:
        self._set_step("prepare", 8, "检查环境与凭据…")
        cmd = [sys.executable, str(QUICK_COMMIT), "--deploy"]
        if commit_message:
            cmd.append(commit_message)

        env = os.environ.copy()
        deploy_env = ROOT / ".env.deploy.local"
        if deploy_env.is_file():
            for raw in deploy_env.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and value and key not in env:
                    env[key] = value

        self._append_log(f"[publish] 执行: {' '.join(cmd)}")
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=ROOT,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
        except OSError as exc:
            self._append_log(f"[publish] 启动失败: {exc}")
            self._finish(1, f"启动失败: {exc}")
            return

        assert proc.stdout is not None
        for line in proc.stdout:
            self._append_log(line)
            self._infer_step(line)

        code = proc.wait()
        if code == 0:
            self._finish(0, "发布成功：已提交、推送并部署")
            self._append_log(f"[{now_str()}] 全部完成 ✓")
        else:
            self._finish(code, "发布失败，请查看日志")
            self._append_log(f"[{now_str()}] 失败，退出码 {code}")


HUB = PublishHub()

HTML_PAGE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>发布控制台 · strategy-compare-cloud</title>
  <style>
    :root {
      --bg: #0f1419;
      --panel: #1a2332;
      --border: #2d3a4f;
      --text: #e8edf4;
      --muted: #8b9cb3;
      --accent: #4f8cff;
      --ok: #3fb983;
      --err: #e85d6f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    .wrap { max-width: 920px; margin: 0 auto; padding: 1.5rem 1rem 2rem; }
    h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
    .sub { color: var(--muted); margin: 0 0 1.25rem; font-size: 0.95rem; }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem 1.1rem;
      margin-bottom: 1rem;
    }
    label { display: block; font-size: 0.875rem; color: var(--muted); margin-bottom: 0.35rem; }
    input[type="text"] {
      width: 100%;
      padding: 0.65rem 0.75rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: #0d1218;
      color: var(--text);
      font-size: 1rem;
    }
    .btn-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1rem; }
    button {
      border: none;
      border-radius: 8px;
      padding: 0.7rem 1.2rem;
      font-size: 1rem;
      cursor: pointer;
      font-weight: 600;
    }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn-primary { background: var(--accent); color: #fff; flex: 1; min-width: 200px; }
    .btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
    .progress-track {
      height: 10px;
      background: #0d1218;
      border-radius: 999px;
      overflow: hidden;
      margin: 0.75rem 0 0.5rem;
    }
    .progress-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, var(--accent), #6ea8ff);
      transition: width 0.35s ease;
    }
    .steps { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }
    .step {
      font-size: 0.75rem;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      border: 1px solid var(--border);
      color: var(--muted);
    }
    .step.active { border-color: var(--accent); color: var(--accent); background: rgba(79,140,255,0.12); }
    .step.done { border-color: var(--ok); color: var(--ok); }
    .status-line { font-size: 0.95rem; margin-top: 0.35rem; }
    .status-line.ok { color: var(--ok); }
    .status-line.err { color: var(--err); }
    .status-line.run { color: var(--accent); }
    #log {
      margin: 0;
      height: 360px;
      overflow: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.8rem;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
      color: #c5d0e0;
    }
    .meta { font-size: 0.8rem; color: var(--muted); margin-top: 0.5rem; }
    .log-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.65rem;
    }
    .log-head h2 {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--muted);
    }
    .btn-copy {
      background: transparent;
      color: var(--muted);
      border: 1px solid var(--border);
      padding: 0.4rem 0.75rem;
      font-size: 0.85rem;
      font-weight: 500;
      flex-shrink: 0;
    }
    .btn-copy.err {
      border-color: var(--err);
      color: var(--err);
      background: rgba(232, 93, 111, 0.08);
    }
    .btn-copy.copied {
      border-color: var(--ok);
      color: var(--ok);
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>发布控制台</h1>
    <p class="sub">一键：Git 提交 → 推送 → Cloudflare 部署 · 本机常驻 <code id="url"></code></p>

    <div class="card">
      <label for="msg">提交说明（已自动识别，可修改后再发布）</label>
      <input id="msg" type="text" placeholder="正在识别改动…" />
      <div class="btn-row">
        <button id="publish" class="btn-primary">发布（提交 + 推送 + 部署）</button>
        <button id="refresh" class="btn-ghost">刷新状态</button>
      </div>
    </div>

    <div class="card">
      <div class="progress-track"><div id="bar" class="progress-bar"></div></div>
      <div id="steps" class="steps"></div>
      <div id="status" class="status-line">待命</div>
      <div id="meta" class="meta"></div>
    </div>

    <div class="card">
      <div class="log-head">
        <h2>日志</h2>
        <button id="copyLog" class="btn-copy" type="button" hidden>复制错误日志</button>
      </div>
      <pre id="log"></pre>
    </div>
  </div>
  <script>
    const stepOrder = ["prepare","git_add","commit","push","deploy","done"];
    const stepLabels = {
      prepare: "准备", git_add: "暂存", commit: "提交", push: "推送", deploy: "部署", done: "完成"
    };
    const el = (id) => document.getElementById(id);
    const publishBtn = el("publish");
    const msgInput = el("msg");
    const logEl = el("log");
    const barEl = el("bar");
    const statusEl = el("status");
    const metaEl = el("meta");
    const stepsEl = el("steps");
    const copyLogBtn = el("copyLog");
    let msgTouched = false;
    let lastSnapshot = null;
    let copyResetTimer = null;

    msgInput.addEventListener("input", () => {
      msgTouched = true;
    });

    async function loadSuggestedMessage(force) {
      if (msgTouched && !force) return;
      try {
        const res = await fetch("/api/suggest-message");
        const data = await res.json();
        if (!data.message) return;
        msgInput.value = data.message;
      } catch (_) {}
    }

    function renderSteps(current, progress, jobStatus) {
      stepsEl.innerHTML = stepOrder.map((id) => {
        let cls = "step";
        const idx = stepOrder.indexOf(id);
        const cur = stepOrder.indexOf(current);
        if (jobStatus === "success" || idx < cur) cls += " done";
        else if (idx === cur) cls += " active";
        return `<span class="${cls}">${stepLabels[id] || id}</span>`;
      }).join("");
      barEl.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    }

    function setStatus(text, kind) {
      statusEl.textContent = text;
      statusEl.className = "status-line" + (kind ? " " + kind : "");
    }

    function appendLog(line) {
      logEl.textContent += line + "\\n";
      logEl.scrollTop = logEl.scrollHeight;
    }

    function buildErrorReport(data) {
      const logs = Array.isArray(data?.logs) ? data.logs : logEl.textContent.split("\\n").filter(Boolean);
      const lines = [
        "=== strategy-compare-cloud 发布控制台错误报告 ===",
        "项目: strategy-compare-cloud",
        "控制台: " + (data?.url || location.origin),
        "状态: " + (data?.message || "发布失败"),
        "退出码: " + (data?.exit_code ?? "未知"),
      ];
      if (data?.started_at) lines.push("开始: " + data.started_at);
      if (data?.finished_at) lines.push("结束: " + data.finished_at);
      if (data?.step) lines.push("失败步骤: " + (stepLabels[data.step] || data.step));
      lines.push("", "--- 完整日志 ---", "");
      lines.push(...logs);
      return lines.join("\\n");
    }

    async function copyErrorLog() {
      const text = buildErrorReport(lastSnapshot || { logs: logEl.textContent.split("\\n").filter(Boolean) });
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      copyLogBtn.textContent = "已复制 ✓";
      copyLogBtn.classList.add("copied");
      clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => {
        copyLogBtn.textContent = "复制错误日志";
        copyLogBtn.classList.remove("copied");
      }, 2000);
    }

    function updateCopyButton(data) {
      const isError = data?.status === "error";
      copyLogBtn.hidden = !isError;
      copyLogBtn.classList.toggle("err", isError);
      if (!isError) {
        copyLogBtn.textContent = "复制错误日志";
        copyLogBtn.classList.remove("copied");
      }
    }

    function applySnapshot(data) {
      lastSnapshot = data;
      el("url").textContent = data.url || location.origin;
      renderSteps(data.step, data.progress, data.status);
      if (data.status === "running") {
        setStatus(data.message || "发布进行中…", "run");
        publishBtn.disabled = true;
      } else if (data.status === "success") {
        setStatus(data.message || "发布成功", "ok");
        publishBtn.disabled = false;
        msgTouched = false;
        void loadSuggestedMessage(true);
      } else if (data.status === "error") {
        setStatus(data.message || "发布失败", "err");
        publishBtn.disabled = false;
      } else {
        setStatus("待命，点击「发布」开始", "");
        publishBtn.disabled = false;
      }
      const parts = [];
      if (data.started_at) parts.push("开始: " + data.started_at);
      if (data.finished_at) parts.push("结束: " + data.finished_at);
      metaEl.textContent = parts.join(" · ");
      if (Array.isArray(data.logs)) {
        logEl.textContent = data.logs.join("\\n") + (data.logs.length ? "\\n" : "");
        logEl.scrollTop = logEl.scrollHeight;
      }
      updateCopyButton(data);
    }

    async function refresh() {
      const res = await fetch("/api/status");
      const data = await res.json();
      applySnapshot(data);
      if (data.status !== "running") {
        await loadSuggestedMessage(false);
      }
    }

    publishBtn.addEventListener("click", async () => {
      const msg = el("msg").value.trim();
      publishBtn.disabled = true;
      setStatus("正在启动…", "run");
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus(data.error || "无法启动", "err");
        publishBtn.disabled = false;
        return;
      }
      await refresh();
    });

    el("refresh").addEventListener("click", async () => {
      msgTouched = false;
      await refresh();
    });

    copyLogBtn.addEventListener("click", () => {
      void copyErrorLog();
    });

    const es = new EventSource("/api/events");
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "log") appendLog(data.line);
        if (data.type === "progress" || data.type === "finished" || data.type === "started") {
          refresh();
        }
      } catch (_) {}
    };
    es.onerror = () => { /* 断线后靠轮询 */ };

    refresh();
    loadSuggestedMessage(false);
    setInterval(refresh, 8000);
  </script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    server_version = "PublishConsole/1.0"

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
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            body = HTML_PAGE.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path == "/api/status":
            self._send_json(HUB.snapshot())
            return

        if path == "/api/suggest-message":
            try:
                message = summarize_worktree_commit_message()
            except Exception as exc:  # noqa: BLE001 — 预览失败不应拖垮页面
                message = "代码更新"
                err = str(exc)
            else:
                err = ""
            self._send_json({"ok": True, "message": message, "error": err or None})
            return

        if path == "/api/events":
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()

            q = HUB.subscribe()
            try:
                snap = json.dumps({"type": "snapshot", **HUB.snapshot()}, ensure_ascii=False)
                self.wfile.write(f"data: {snap}\n\n".encode("utf-8"))
                self.wfile.flush()
                while True:
                    try:
                        line = q.get(timeout=25)
                    except queue.Empty:
                        self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
                        continue
                    self.wfile.write(f"data: {line}\n\n".encode("utf-8"))
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                with HUB._lock:
                    if q in HUB._subscribers:
                        HUB._subscribers.remove(q)
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/api/publish":
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
    if not QUICK_COMMIT.is_file():
        print(f"未找到 {QUICK_COMMIT}", file=sys.stderr)
        return 1

    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}/"
    print(f"[publish-console] 监听 {url}", flush=True)
    print("[publish-console] 按 Ctrl+C 停止", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[publish-console] 已停止", flush=True)
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
