"""日语统一补全：毒丸 / 付费间隔 / 维护中心词条上报（从 online-batch 抽出控行数）。"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

from paid_anthropic_client import poison_seconds_for_generate_error
from jp_vocab_fill_common import load_env_file

CONFIG_DIR = Path.home() / ".config" / "info-quests"
POISON_PATH = CONFIG_DIR / "jp-vocab-fill-online.poison.json"
RATE_GATE_PATH = CONFIG_DIR / "jp-vocab-fill-online.last_paid_call"
MAINTENANCE_WORD_RUN_URL = "http://127.0.0.1:17823/api/jp-vocab-fill/word-runs"

DEFAULT_MIN_INTERVAL_SEC = 60
DEFAULT_POISON_SEC = 6 * 3600


def resolve_min_interval_sec() -> int:
    raw = (
        __import__("os").environ.get("JP_VOCAB_FILL_ONLINE_MIN_INTERVAL_SEC", "").strip()
        or load_env_file("jp-vocab-fill.env").get(
            "JP_VOCAB_FILL_ONLINE_MIN_INTERVAL_SEC", ""
        )
        or str(DEFAULT_MIN_INTERVAL_SEC)
    )
    try:
        return max(30, int(raw))
    except ValueError:
        return DEFAULT_MIN_INTERVAL_SEC


def resolve_poison_sec() -> int:
    raw = (
        __import__("os").environ.get("JP_VOCAB_FILL_ONLINE_POISON_SEC", "").strip()
        or load_env_file("jp-vocab-fill.env").get(
            "JP_VOCAB_FILL_ONLINE_POISON_SEC", ""
        )
        or str(DEFAULT_POISON_SEC)
    )
    try:
        return max(300, int(raw))
    except ValueError:
        return DEFAULT_POISON_SEC


def load_poison() -> dict[str, dict]:
    if not POISON_PATH.is_file():
        return {}
    try:
        raw = json.loads(POISON_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    now = time.time()
    out: dict[str, dict] = {}
    for key, val in raw.items():
        if not isinstance(val, dict):
            continue
        try:
            until = float(val.get("until"))
        except (TypeError, ValueError):
            continue
        if until > now:
            out[str(key)] = val
    return out


def save_poison(data: dict[str, dict]) -> None:
    POISON_PATH.parent.mkdir(parents=True, exist_ok=True)
    POISON_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def mark_poison(word_id: int, word: str, reason: str) -> None:
    data = load_poison()
    sec = poison_seconds_for_generate_error(reason, default_sec=resolve_poison_sec())
    data[str(word_id)] = {
        "word": word,
        "reason": reason,
        "until": time.time() + sec,
    }
    save_poison(data)
    print(
        f"    poison id={word_id} for {sec}s (reason={reason})",
        flush=True,
    )


def acquire_paid_rate_gate(*, allow_burst: bool) -> bool:
    if allow_burst:
        return True
    min_sec = resolve_min_interval_sec()
    now = time.time()
    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if RATE_GATE_PATH.is_file():
        try:
            last = float(RATE_GATE_PATH.read_text(encoding="utf-8").strip() or "0")
        except (OSError, ValueError):
            last = 0.0
        elapsed = now - last
        if elapsed < min_sec:
            wait = int(min_sec - elapsed)
            print(
                f"[jp-vocab-fill-online] rate-gate: 距上次付费仅 {elapsed:.0f}s "
                f"< {min_sec}s，skip（约 {wait}s 后再试）",
                flush=True,
            )
            return False
    return True


def mark_paid_call() -> None:
    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    RATE_GATE_PATH.write_text(f"{time.time():.3f}\n", encoding="utf-8")


def now_local_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def report_word_run_to_maintenance_center(payload: dict[str, Any]) -> None:
    """维护中心「最近词条」；维护中心未开时静默跳过。"""
    try:
        body_obj = dict(payload)
        if not str(body_obj.get("fill_task") or "").strip():
            body_obj["fill_task"] = "jp-vocab-fill-unified"
        body = json.dumps(body_obj, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            MAINTENANCE_WORD_RUN_URL,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        pass
