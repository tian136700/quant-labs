#!/usr/bin/env python3
"""日语新课 jp_lesson 表：仅增量创建，不删数据。"""

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


def table_exists(remote: bool, name: str) -> bool:
    rows = run_wrangler(
        remote,
        f"SELECT name FROM sqlite_master WHERE type='table' AND name='{name}';",
    )
    if isinstance(rows, list) and rows:
        results = rows[0].get("results") or []
        return len(results) > 0
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
    print(f"[migrate-jp-lesson] target={label}", flush=True)

    if table_exists(remote, "jp_lesson"):
        print("[migrate-jp-lesson] jp_lesson already exists, skip", flush=True)
        return 0

    run_wrangler(
        remote,
        """
        CREATE TABLE IF NOT EXISTS jp_lesson (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          kind        TEXT NOT NULL DEFAULT 'word',
          content     TEXT NOT NULL,
          title       TEXT,
          ref_key     TEXT,
          uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (ref_key) REFERENCES jp_vocab_ref (ref_key) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_jp_lesson_uploaded ON jp_lesson (uploaded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_jp_lesson_ref ON jp_lesson (ref_key);
        """.strip(),
    )
    print("[migrate-jp-lesson] done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
