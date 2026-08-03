#!/usr/bin/env python3
"""Cursor Agent 空闲门禁：用户刚做完任务后，再等 N 分钟才允许后台 SDK 自动修。

状态由 hooks 写入（preToolUse=忙；stop=空闲起点）。
定时任务只读：busy 或 idle 不足 → 可检测入队，但不启动 Agent。
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STATE_PATH = (
    Path.home() / ".config" / "info-quests" / "cursor-agent-idle.json"
)
DEFAULT_IDLE_SECONDS = 600  # 10 分钟


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(raw: str | None) -> float | None:
    if not raw or not str(raw).strip():
        return None
    text = str(raw).strip()
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text).timestamp()
    except ValueError:
        return None


def read_idle_state() -> dict[str, Any]:
    if not STATE_PATH.is_file():
        return {
            "busy": False,
            "last_event": None,
            "last_at": None,
            "idle_since": None,
        }
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {
            "busy": False,
            "last_event": None,
            "last_at": None,
            "idle_since": None,
        }
    return data if isinstance(data, dict) else {}


def write_idle_state(data: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(data)
    payload["updated_at"] = _now_iso()
    STATE_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def mark_agent_busy(*, event: str = "preToolUse", conversation_id: str = "") -> None:
    """用户正在 Cursor 里跑 Agent / 用工具 → 忙。"""
    prev = read_idle_state()
    write_idle_state(
        {
            **prev,
            "busy": True,
            "last_event": event,
            "last_at": _now_iso(),
            "idle_since": None,
            "conversation_id": conversation_id or prev.get("conversation_id"),
        }
    )


def mark_agent_idle(*, event: str = "stop", conversation_id: str = "") -> None:
    """Agent 回合结束 → 开始累计空闲。"""
    prev = read_idle_state()
    write_idle_state(
        {
            **prev,
            "busy": False,
            "last_event": event,
            "last_at": _now_iso(),
            "idle_since": _now_iso(),
            "conversation_id": conversation_id or prev.get("conversation_id"),
        }
    )


def idle_gate_seconds() -> int:
    raw = (
        os.environ.get("JP_VOCAB_FILL_FAIL_AUTOFIX_IDLE_SECONDS")
        or os.environ.get("CURSOR_AGENT_IDLE_SECONDS")
        or ""
    ).strip()
    if raw.isdigit():
        return max(60, int(raw))
    return DEFAULT_IDLE_SECONDS


def is_cursor_agent_idle(
    *,
    min_idle_seconds: int | None = None,
    now_ts: float | None = None,
) -> tuple[bool, str]:
    """返回 (是否可启动后台 Agent, 原因文案)。

    - 从未有过活动 → 视为空闲（人不在 / 未用 Cursor）
    - busy=True → 不可
    - idle_since 距今不足 min_idle_seconds → 不可
    """
    need = idle_gate_seconds() if min_idle_seconds is None else max(0, int(min_idle_seconds))
    state = read_idle_state()
    if bool(state.get("busy")):
        return False, "cursor_agent_busy"
    idle_since = _parse_iso(str(state.get("idle_since") or "") or None)
    if idle_since is None and not state.get("last_at"):
        return True, "never_seen_idle_ok"
    if idle_since is None:
        # 有过活动但没 stop 标记：保守当作忙过、尚无空闲起点
        return False, "no_idle_since_yet"
    now = time.time() if now_ts is None else float(now_ts)
    elapsed = now - idle_since
    if elapsed < need:
        remain = int(need - elapsed)
        return False, f"idle_wait_{remain}s"
    return True, f"idle_ok_{int(elapsed)}s"
