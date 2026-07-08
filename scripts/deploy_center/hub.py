from __future__ import annotations

import os
import queue
import subprocess
import sys
import threading
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from d1_backup import maybe_backup_before_deploy, strip_ansi
from git_commit_message import ROOT as REPO_ROOT

ROOT = Path(__file__).resolve().parent.parent.parent
QUICK_COMMIT = ROOT / "git-quick-commit.py"
JOB_LOCK_FILE = ROOT / ".publish-console.job.lock"

STEPS = [
    ("prepare", "准备"),
    ("backup", "数据库备份"),
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
    status: str = "idle"
    step: str = "prepare"
    progress: int = 0
    message: str = ""
    started_at: str | None = None
    finished_at: str | None = None
    exit_code: int | None = None
    logs: list[str] = field(default_factory=list)


def _set_job_lock(active: bool) -> None:
    try:
        if active:
            JOB_LOCK_FILE.write_text("running\n", encoding="utf-8")
        elif JOB_LOCK_FILE.is_file():
            JOB_LOCK_FILE.unlink()
    except OSError:
        pass


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
                "logs": self._job.logs[-500:],
                "server_time": now_str(),
            }

    def subscribe(self) -> queue.Queue[str]:
        q: queue.Queue[str] = queue.Queue()
        with self._lock:
            self._subscribers.append(q)
        return q

    def unsubscribe(self, q: queue.Queue[str]) -> None:
        with self._lock:
            if q in self._subscribers:
                self._subscribers.remove(q)

    def _broadcast(self, payload: dict[str, Any]) -> None:
        dead: list[queue.Queue[str]] = []
        for sub in self._subscribers:
            try:
                sub.put_nowait(payload)
            except queue.Full:
                dead.append(sub)
        for sub in dead:
            self.unsubscribe(sub)

    def _set_step(self, step_id: str, progress: int, message: str = "") -> None:
        with self._lock:
            self._job.step = step_id
            self._job.progress = progress
            if message:
                self._job.message = message
        self._broadcast({"type": "progress"})

    def _append_log(self, text: str) -> None:
        line = text.rstrip("\n")
        if not line:
            return
        with self._lock:
            self._job.logs.append(line)
            if len(self._job.logs) > 2500:
                self._job.logs = self._job.logs[-1800:]
        self._broadcast({"type": "log", "line": line})

    def _infer_step(self, line: str) -> None:
        lower = line.lower()
        if "[d1-backup]" in line:
            self._set_step("backup", 12, "正在备份数据库…")
        elif "git add" in lower:
            self._set_step("git_add", 22, "正在暂存文件…")
        elif "committed:" in lower:
            self._set_step("commit", 42, "已创建提交")
        elif "pushed to origin" in lower:
            self._set_step("push", 62, "已推送到远程仓库")
        elif "npm run deploy" in lower:
            self._set_step("deploy", 78, "正在构建并部署…")
        elif "deploy finished" in lower:
            self._set_step("deploy", 95, "部署命令已完成")

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
                logs=[f"[{now_str()}] 手动部署任务开始"],
            )
            self._thread = threading.Thread(
                target=self._run_job,
                args=(commit_message.strip(),),
                daemon=True,
            )
            _set_job_lock(True)
            self._thread.start()
        self._broadcast({"type": "started"})
        return True, "ok"

    def _finish(self, exit_code: int, message: str) -> None:
        with self._lock:
            self._job.exit_code = exit_code
            self._job.finished_at = now_str()
            self._job.status = "success" if exit_code == 0 else "error"
            if exit_code == 0:
                self._job.step = "done"
                self._job.progress = 100
            self._job.message = message
        self._broadcast({"type": "finished"})
        _set_job_lock(False)

    def _load_deploy_env(self, env: dict[str, str]) -> dict[str, str]:
        deploy_env = ROOT / ".env.deploy.local"
        if not deploy_env.is_file():
            return env
        merged = env.copy()
        for raw in deploy_env.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and value and key not in merged:
                merged[key] = value
        return merged

    def _run_job(self, commit_message: str) -> None:
        self._set_step("prepare", 8, "检查环境与凭据…")
        try:
            maybe_backup_before_deploy([], log_fn=self._append_log, auth_failure_mode="warn_skip")
        except RuntimeError as exc:
            msg = strip_ansi(str(exc))
            self._append_log(f"[d1-backup] 备份失败，已中止发布: {msg}")
            self._finish(1, f"数据库备份失败: {msg}")
            return
        except OSError as exc:
            msg = strip_ansi(str(exc))
            self._append_log(f"[d1-backup] 备份失败，已中止发布: {msg}")
            self._finish(1, f"数据库备份失败: {msg}")
            return

        cmd = [sys.executable, str(QUICK_COMMIT), "--deploy"]
        if commit_message:
            cmd.append(commit_message)

        env = self._load_deploy_env(os.environ.copy())
        env["PUBLISH_CONSOLE_SKIP_D1_BACKUP"] = "1"
        env["DEPLOY_LOG_MODE"] = "manual"
        env["DEPLOY_TRIGGER_SOURCE"] = "publish-console"
        env["DEPLOY_REMARK"] = commit_message

        self._append_log(f"[publish] 执行: {' '.join(cmd)}")
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=REPO_ROOT,
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
            self._finish(0, "手动部署成功")
            self._append_log(f"[{now_str()}] 全部完成 ✓")
        else:
            self._finish(code, "手动部署失败，请查看日志")
            self._append_log(f"[{now_str()}] 失败，退出码 {code}")

