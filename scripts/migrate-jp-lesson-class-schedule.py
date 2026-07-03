#!/usr/bin/env python3
"""jp_lesson_class_schedule 表：支持多条预约上课时间（可重复执行）。"""

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

    if not table_exists(remote, "jp_lesson_class_schedule"):
        run_wrangler(
            remote,
            """
            CREATE TABLE jp_lesson_class_schedule (
              id               INTEGER PRIMARY KEY AUTOINCREMENT,
              lesson_id        INTEGER NOT NULL,
              class_at         TEXT    NOT NULL,
              duration_minutes INTEGER,
              sort_order       INTEGER NOT NULL DEFAULT 0,
              created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (lesson_id) REFERENCES jp_lesson (id) ON DELETE CASCADE
            );
            """.strip(),
        )
        print("[migrate-jp-lesson-class-schedule] created jp_lesson_class_schedule", flush=True)
    else:
        print(
            "[migrate-jp-lesson-class-schedule] jp_lesson_class_schedule exists, skip create",
            flush=True,
        )

    run_wrangler(
        remote,
        "CREATE INDEX IF NOT EXISTS idx_jp_lesson_class_schedule_lesson ON jp_lesson_class_schedule (lesson_id, sort_order ASC, class_at ASC);",
    )

    run_wrangler(
        remote,
        """
        INSERT INTO jp_lesson_class_schedule (lesson_id, class_at, duration_minutes, sort_order, created_at)
        SELECT l.id, l.next_class_at, l.class_duration_minutes, 0, COALESCE(l.updated_at, datetime('now'))
        FROM jp_lesson l
        WHERE l.next_class_at IS NOT NULL
          AND TRIM(l.next_class_at) != ''
          AND NOT EXISTS (
            SELECT 1 FROM jp_lesson_class_schedule s WHERE s.lesson_id = l.id
          );
        """.strip(),
    )
    print(
        "[migrate-jp-lesson-class-schedule] migrated legacy next_class_at rows",
        flush=True,
    )

    print("[migrate-jp-lesson-class-schedule] done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
