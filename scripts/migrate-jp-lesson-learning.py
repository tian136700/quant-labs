#!/usr/bin/env python3
"""jp_lesson 增加 learning 列（可重复执行）。"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"


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


def column_exists(remote: bool, table: str, column: str) -> bool:
    rows = run_wrangler(remote, f"PRAGMA table_info({table});")
    if isinstance(rows, list) and rows:
        for r in rows[0].get("results") or []:
            if str(r.get("name")) == column:
                return True
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
    if column_exists(remote, "jp_lesson", "learning"):
        print("[migrate-jp-lesson-learning] already exists, skip", flush=True)
        return 0

    run_wrangler(
        remote,
        "ALTER TABLE jp_lesson ADD COLUMN learning INTEGER NOT NULL DEFAULT 0;",
    )
    print("[migrate-jp-lesson-learning] done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
