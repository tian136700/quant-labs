#!/usr/bin/env python3
"""为 jp_lesson 增加 example_sentences 列（增量，不删数据）。"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"


def run_wrangler(remote: bool, sql: str) -> list:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB,
        "--command",
        sql,
        "-y",
    ]
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
        results = rows[0].get("results") or []
        return any(str(r.get("name")) == column for r in results)
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
    print(f"[migrate-jp-lesson-example-sentences] target={label}", flush=True)

    if column_exists(remote, "jp_lesson", "example_sentences"):
        print("[migrate-jp-lesson-example-sentences] column already exists, skip", flush=True)
        return 0

    run_wrangler(remote, "ALTER TABLE jp_lesson ADD COLUMN example_sentences TEXT;")
    print("[migrate-jp-lesson-example-sentences] added example_sentences", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
