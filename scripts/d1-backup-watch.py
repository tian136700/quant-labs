#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE_FILE = ROOT / ".d1-backup-state.json"
BACKUP_ROOT = ROOT / "tmp" / "d1-backups"
REASON = "daily-auto"
PYTHON = sys.executable

# 推荐凌晨备份：业务低峰、对本机影响更小
SCHEDULE_HOUR = 4
SCHEDULE_MINUTE = 20


def now() -> datetime:
    return datetime.now()


def load_state() -> dict[str, str]:
    if not STATE_FILE.is_file():
        return {}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_state(payload: dict[str, str]) -> None:
    STATE_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def should_run_today() -> tuple[bool, str]:
    current = now()
    today = current.strftime("%Y-%m-%d")
    state = load_state()
    last_ok = str(state.get("last_success_date", "")).strip()

    if last_ok == today:
        return False, f"今天已备份，跳过（{today}）"

    scheduled = current.replace(
        hour=SCHEDULE_HOUR,
        minute=SCHEDULE_MINUTE,
        second=0,
        microsecond=0,
    )
    if current < scheduled:
        return False, (
            f"未到备份时间，跳过（当前 {current.strftime('%H:%M')}，"
            f"计划 {SCHEDULE_HOUR:02d}:{SCHEDULE_MINUTE:02d}）"
        )
    return True, "满足执行条件"


def cleanup_keep_latest_daily() -> None:
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    dirs = sorted(
        [p for p in BACKUP_ROOT.iterdir() if p.is_dir() and p.name.endswith(f"-{REASON}")],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in dirs[1:]:
        shutil.rmtree(old, ignore_errors=True)
        print(f"[d1-daily] 已删除旧备份: {old}", flush=True)


def run_backup() -> int:
    cmd = [PYTHON, str(ROOT / "scripts" / "d1_backup.py"), "--remote", "--reason", REASON]
    print(f"[d1-daily] 执行备份: {' '.join(cmd)}", flush=True)
    proc = subprocess.run(cmd, cwd=ROOT)
    return proc.returncode


def main() -> int:
    ok, reason = should_run_today()
    print(f"[d1-daily] {reason}", flush=True)
    if not ok:
        return 0

    code = run_backup()
    if code != 0:
        print(f"[d1-daily] 备份失败，退出码 {code}", flush=True)
        return code

    cleanup_keep_latest_daily()

    current = now()
    save_state(
        {
            "last_success_date": current.strftime("%Y-%m-%d"),
            "last_success_at": current.strftime("%Y-%m-%d %H:%M:%S"),
            "schedule": f"{SCHEDULE_HOUR:02d}:{SCHEDULE_MINUTE:02d}",
        }
    )
    print("[d1-daily] 备份完成（每日仅一次，且仅保留最近一份）", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
