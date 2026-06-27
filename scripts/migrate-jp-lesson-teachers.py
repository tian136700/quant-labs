#!/usr/bin/env python3
"""jp_lesson_teacher 表 + jp_lesson_teacher_link 多对多关联（可重复执行）。"""

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

    if not table_exists(remote, "jp_lesson_teacher"):
        run_wrangler(
            remote,
            """
            CREATE TABLE jp_lesson_teacher (
              id          INTEGER PRIMARY KEY AUTOINCREMENT,
              name        TEXT    NOT NULL UNIQUE,
              sort_order  INTEGER NOT NULL DEFAULT 0,
              created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
              updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
            );
            """.strip(),
        )
        print("[migrate-jp-lesson-teachers] created jp_lesson_teacher", flush=True)
    else:
        print("[migrate-jp-lesson-teachers] jp_lesson_teacher exists, skip create", flush=True)

    run_wrangler(
        remote,
        "CREATE INDEX IF NOT EXISTS idx_jp_lesson_teacher_sort ON jp_lesson_teacher (sort_order ASC, id ASC);",
    )

    if not column_exists(remote, "jp_lesson", "teacher_id"):
        run_wrangler(
            remote,
            "ALTER TABLE jp_lesson ADD COLUMN teacher_id INTEGER REFERENCES jp_lesson_teacher (id) ON DELETE SET NULL;",
        )
        print("[migrate-jp-lesson-teachers] added jp_lesson.teacher_id", flush=True)
    else:
        print("[migrate-jp-lesson-teachers] jp_lesson.teacher_id exists, skip", flush=True)

    if not table_exists(remote, "jp_lesson_teacher_link"):
        run_wrangler(
            remote,
            """
            CREATE TABLE jp_lesson_teacher_link (
              lesson_id  INTEGER NOT NULL,
              teacher_id INTEGER NOT NULL,
              created_at TEXT    NOT NULL DEFAULT (datetime('now')),
              PRIMARY KEY (lesson_id, teacher_id),
              FOREIGN KEY (lesson_id) REFERENCES jp_lesson (id) ON DELETE CASCADE,
              FOREIGN KEY (teacher_id) REFERENCES jp_lesson_teacher (id) ON DELETE CASCADE
            );
            """.strip(),
        )
        print("[migrate-jp-lesson-teachers] created jp_lesson_teacher_link", flush=True)
    else:
        print("[migrate-jp-lesson-teachers] jp_lesson_teacher_link exists, skip create", flush=True)

    run_wrangler(
        remote,
        "CREATE INDEX IF NOT EXISTS idx_jp_lesson_teacher_link_teacher ON jp_lesson_teacher_link (teacher_id);",
    )

    run_wrangler(
        remote,
        """
        INSERT OR IGNORE INTO jp_lesson_teacher_link (lesson_id, teacher_id)
        SELECT id, teacher_id FROM jp_lesson WHERE teacher_id IS NOT NULL;
        """.strip(),
    )
    print("[migrate-jp-lesson-teachers] migrated legacy teacher_id to link table", flush=True)

    print("[migrate-jp-lesson-teachers] done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
