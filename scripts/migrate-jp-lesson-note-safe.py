#!/usr/bin/env python3
"""日语新课课堂笔记 jp_lesson_note 表：仅增量创建，不删数据。"""

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
    print(f"[migrate-jp-lesson-note] target={label}", flush=True)

    if table_exists(remote, "jp_lesson_note"):
        print("[migrate-jp-lesson-note] jp_lesson_note already exists, skip", flush=True)
        return 0

    run_wrangler(
        remote,
        """
        CREATE TABLE IF NOT EXISTS jp_lesson_note (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          lesson_id  INTEGER NOT NULL,
          item_word  TEXT    NOT NULL,
          body       TEXT    NOT NULL,
          created_by TEXT,
          created_at TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (lesson_id) REFERENCES jp_lesson (id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_jp_lesson_note_lesson ON jp_lesson_note (lesson_id);
        """.strip(),
    )
    print("[migrate-jp-lesson-note] done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
