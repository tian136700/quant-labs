"""维护中心重启误标「部署失败」（与 Cloudflare / 业务代码无关）。

git-auto-push / git-quick-commit 会写 mode=auto 的 deploy_logs，但不占用 hub
内存态。维护中心进程一重启，auto-runtime 对账会把仍在跑的 auto 行标成
「任务中断（维护中心已重启…）」——这是本地运维假失败，禁止当成 Worker 构建
错误去改页面或强制再发 Cloudflare。
"""

from __future__ import annotations

import os
import re
import subprocess
from datetime import datetime
from typing import Any

HUB_RESTART_INTERRUPT_MARK = "任务中断（维护中心已重启"

# auto idle deploy 通常 3～5 分钟；给足余量，避免对账误杀
STALE_AUTO_ABANDON_MINUTES = int(
    os.environ.get("MC_STALE_AUTO_ABANDON_MINUTES", "45").strip() or "45"
)


def is_maintenance_center_restart_interrupt(output: str) -> bool:
    """日志仅为（或主要是）维护中心重启中断，不是构建/CF 失败。"""
    text = output or ""
    return HUB_RESTART_INTERRUPT_MARK in text


def is_git_auto_push_trigger(trigger_source: str | None) -> bool:
    src = (trigger_source or "").strip().lower()
    return src.startswith("git-auto-push")


def parse_deploy_log_started_at(value: Any) -> datetime | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text == "-":
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            return datetime.strptime(text.replace("+00:00", ""), fmt.replace("%z", ""))
        except ValueError:
            continue
    # ISO with timezone leftovers
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def auto_deploy_log_age_minutes(row: dict[str, Any], *, now: datetime | None = None) -> float | None:
    started = parse_deploy_log_started_at(row.get("started_at"))
    if started is None:
        return None
    current = now or datetime.now()
    return max(0.0, (current - started).total_seconds() / 60.0)


def external_auto_deploy_process_running() -> bool:
    """git-auto-push / git-quick-commit --deploy 是否仍在跑（不经 hub 锁）。"""
    patterns = (
        r"git-auto-push-(once|watch)\.py",
        r"git-quick-commit\.py",
    )
    for pattern in patterns:
        try:
            proc = subprocess.run(
                ["pgrep", "-f", pattern],
                capture_output=True,
                text=True,
                timeout=2,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue
        if proc.returncode == 0 and (proc.stdout or "").strip():
            return True
    return False


def should_reconcile_stale_auto_running_row(
    row: dict[str, Any],
    *,
    hub_has_active_auto_job: bool,
    deploy_lock_held: bool = False,
    now: datetime | None = None,
) -> bool:
    """是否允许把仍标 running 的 auto 日志标成「维护中心已重启」失败。

    hub 空闲 ≠ auto idle deploy 已死：后者常绕开 hub 内存态写库。
    """
    if not row or str(row.get("status") or "") != "running":
        return False
    if hub_has_active_auto_job:
        return False
    if deploy_lock_held:
        return False
    if external_auto_deploy_process_running():
        return False
    age = auto_deploy_log_age_minutes(row, now=now)
    # 未知开始时间：宁可不误杀
    if age is None:
        return False
    abandon_after = max(10, STALE_AUTO_ABANDON_MINUTES)
    if age < abandon_after:
        return False
    # 很久仍 running 且无进程：才允许对账收尸
    return True


_DETAILS_ONLY_RE = re.compile(
    r"started_at:\s*.+\nsummary:\s*.+\nremark:\s*.+",
    re.M,
)


def hub_restart_interrupt_is_details_only(details: str, summary: str = "") -> bool:
    """对账写入的短详情（几乎没有真实构建日志）。"""
    blob = f"{summary}\n{details}"
    if not is_maintenance_center_restart_interrupt(blob):
        return False
    # 有典型构建/部署失败信号则不算「仅重启误标」
    real_fail_hints = (
        "Failed to compile",
        "Type error:",
        "npm run deploy exited",
        "Wrangler deploy command failed",
        "Worker gzip",
        "Error 10027",
        "CLOUDFLARE_API_TOKEN",
        "PageNotFoundError",
        "ENOENT",
    )
    if any(h in blob for h in real_fail_hints):
        return False
    return True
