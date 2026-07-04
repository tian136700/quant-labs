#!/usr/bin/env python3
"""日语教师（jp_vocab）角色默认关闭新课权限（可重复执行）。"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"

JP_LESSON_KEYS = ("jp_lesson:read", "jp_lesson:operate")


def run_wrangler(remote: bool, sql: str) -> list:
    cmd = ["npx", "wrangler", "d1", "execute", DB, "--command", sql, "-y"]
    if remote:
        cmd.append("--remote")
    else:
        cmd.append("--local")
    proc = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "wrangler failed")
    text = proc.stdout.strip()
    start = text.find("[")
    if start >= 0:
        return json.loads(text[start:])
    return []


def table_exists(remote: bool, table: str) -> bool:
    rows = run_wrangler(
        remote,
        f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}';",
    )
    if isinstance(rows, list) and rows:
        return bool(rows[0].get("results"))
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--local", action="store_true")
    args = parser.parse_args()
    if args.remote == args.local:
        print("请指定 --remote 或 --local", file=sys.stderr)
        return 1

    remote = args.remote
    label = "remote" if remote else "local"
    print(f"[migrate-rbac-jp-teacher-lesson-off] target={label}", flush=True)

    if not table_exists(remote, "etr_role_permissions"):
        print(
            "[migrate-rbac-jp-teacher-lesson-off] etr_role_permissions missing, skip",
            flush=True,
        )
        return 0

    keys_sql = ", ".join(f"'{k}'" for k in JP_LESSON_KEYS)
    run_wrangler(
        remote,
        f"DELETE FROM etr_role_permissions WHERE role = 'jp_vocab' AND permission_key IN ({keys_sql});",
    )
    print(
        "[migrate-rbac-jp-teacher-lesson-off] removed jp_lesson permissions from jp_vocab role",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
