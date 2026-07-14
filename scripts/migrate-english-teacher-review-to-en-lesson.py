#!/usr/bin/env python3
"""
把公开页 english_teacher_review 的可迁字段导入人员管理（英语老师）：
  - teacher_name → en_lesson_teacher.name（不存在则新建；按时薪等字段旧表没有则跳过）
  - class_date / score / remark / created_at / updated_at → en_lesson_teacher_review

可重复执行：同名老师不重复建；同 teacher_id+class_date+score+remark 的评价不重复插入。
不删除 english_teacher_review 原表数据。

用法:
  python3 scripts/migrate-english-teacher-review-to-en-lesson.py --remote
  python3 scripts/migrate-english-teacher-review-to-en-lesson.py --local
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"
TAG = "[migrate-english-teacher-review-to-en-lesson]"


def sql_quote(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


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


def query_rows(remote: bool, sql: str) -> list[dict]:
    rows = run_wrangler(remote, sql)
    if isinstance(rows, list) and rows:
        return list(rows[0].get("results") or [])
    return []


def table_exists(remote: bool, name: str) -> bool:
    rows = query_rows(
        remote,
        f"SELECT name FROM sqlite_master WHERE type='table' AND name='{name}';",
    )
    return len(rows) > 0


def ensure_tables(remote: bool) -> None:
    if not table_exists(remote, "en_lesson_teacher"):
        run_wrangler(
            remote,
            """
            CREATE TABLE en_lesson_teacher (
              id             INTEGER PRIMARY KEY AUTOINCREMENT,
              name           TEXT    NOT NULL UNIQUE,
              hourly_rate    REAL,
              lesson_minutes INTEGER,
              sort_order     INTEGER NOT NULL DEFAULT 0,
              created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
              updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
            );
            """.strip(),
        )
        print(f"{TAG} created en_lesson_teacher", flush=True)
    run_wrangler(
        remote,
        "CREATE INDEX IF NOT EXISTS idx_en_lesson_teacher_sort ON en_lesson_teacher (sort_order ASC, id ASC);",
    )

    if not table_exists(remote, "en_lesson_teacher_review"):
        run_wrangler(
            remote,
            """
            CREATE TABLE en_lesson_teacher_review (
              id          INTEGER PRIMARY KEY AUTOINCREMENT,
              teacher_id  INTEGER NOT NULL,
              class_date  TEXT    NOT NULL,
              score       INTEGER NOT NULL,
              remark      TEXT,
              created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
              updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (teacher_id) REFERENCES en_lesson_teacher (id) ON DELETE CASCADE
            );
            """.strip(),
        )
        print(f"{TAG} created en_lesson_teacher_review", flush=True)
    for idx_sql in (
        "CREATE INDEX IF NOT EXISTS idx_en_lesson_teacher_review_teacher ON en_lesson_teacher_review (teacher_id);",
        "CREATE INDEX IF NOT EXISTS idx_en_lesson_teacher_review_class_date ON en_lesson_teacher_review (class_date);",
        "CREATE INDEX IF NOT EXISTS idx_en_lesson_teacher_review_updated_at ON en_lesson_teacher_review (updated_at);",
    ):
        run_wrangler(remote, idx_sql)


def normalize_name(name: str) -> str:
    return (name or "").strip()


def name_key(name: str) -> str:
    return normalize_name(name).casefold()


def load_teacher_map(remote: bool) -> dict[str, int]:
    rows = query_rows(remote, "SELECT id, name FROM en_lesson_teacher;")
    out: dict[str, int] = {}
    for row in rows:
        key = name_key(str(row.get("name") or ""))
        if key:
            out[key] = int(row["id"])
    return out


def ensure_teacher(remote: bool, teacher_name: str, teacher_map: dict[str, int]) -> int:
    name = normalize_name(teacher_name)
    if not name:
        raise ValueError("empty teacher_name")
    key = name_key(name)
    existing = teacher_map.get(key)
    if existing is not None:
        return existing

    run_wrangler(
        remote,
        "INSERT INTO en_lesson_teacher (name, sort_order, created_at, updated_at) "
        f"VALUES ({sql_quote(name)}, 0, datetime('now'), datetime('now'));",
    )
    # re-query id (avoid last_insert_rowid across wrangler invocations)
    rows = query_rows(
        remote,
        "SELECT id FROM en_lesson_teacher "
        f"WHERE lower(trim(name)) = lower({sql_quote(name)}) LIMIT 1;",
    )
    if not rows:
        raise RuntimeError(f"failed to create teacher: {name}")
    teacher_id = int(rows[0]["id"])
    teacher_map[key] = teacher_id
    print(f"{TAG} + teacher id={teacher_id} name={name}", flush=True)
    return teacher_id


def review_exists(
    remote: bool,
    teacher_id: int,
    class_date: str,
    score: int,
    remark: str | None,
) -> bool:
    remark_sql = (
        "AND (remark IS NULL OR trim(remark) = '')"
        if remark is None or not str(remark).strip()
        else f"AND remark = {sql_quote(str(remark))}"
    )
    rows = query_rows(
        remote,
        "SELECT id FROM en_lesson_teacher_review "
        f"WHERE teacher_id = {int(teacher_id)} "
        f"AND class_date = {sql_quote(class_date)} "
        f"AND score = {int(score)} "
        f"{remark_sql} "
        "LIMIT 1;",
    )
    return len(rows) > 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--local", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="只打印将要迁移的内容，不写库")
    args = parser.parse_args()
    if args.remote == args.local:
        print("请指定 --remote 或 --local", file=sys.stderr)
        return 1

    remote = args.remote
    label = "remote" if remote else "local"
    print(f"{TAG} target={label} dry_run={args.dry_run}", flush=True)

    if not table_exists(remote, "english_teacher_review"):
        print(f"{TAG} english_teacher_review missing, nothing to migrate", flush=True)
        return 0

    if not args.dry_run:
        sys.path.insert(0, str(ROOT / "scripts"))
        from d1_backup import ensure_remote_backup  # type: ignore

        if remote:
            ensure_remote_backup(
                ["english_teacher_review", "en_lesson_teacher", "en_lesson_teacher_review"],
                reason="migrate-english-teacher-review-to-en-lesson",
                log_fn=lambda line: print(line, flush=True),
            )
        ensure_tables(remote)

    source = query_rows(
        remote,
        "SELECT id, teacher_name, class_date, score, remark, created_at, updated_at "
        "FROM english_teacher_review ORDER BY id ASC;",
    )
    print(f"{TAG} source rows={len(source)}", flush=True)
    if not source:
        return 0

    teacher_map = load_teacher_map(remote) if not args.dry_run else {}
    # dry-run still loads for reporting
    if args.dry_run:
        teacher_map = {
            name_key(str(r.get("name") or "")): int(r["id"])
            for r in query_rows(remote, "SELECT id, name FROM en_lesson_teacher;")
            if r.get("name")
        }

    created_teachers = 0
    inserted_reviews = 0
    skipped_reviews = 0
    skipped_bad = 0

    for row in source:
        raw_name = normalize_name(str(row.get("teacher_name") or ""))
        class_date = str(row.get("class_date") or "").strip()
        try:
            score = int(row.get("score"))
        except (TypeError, ValueError):
            skipped_bad += 1
            print(f"{TAG} skip id={row.get('id')}: bad score", flush=True)
            continue
        if not raw_name or not class_date:
            skipped_bad += 1
            print(f"{TAG} skip id={row.get('id')}: missing name/date", flush=True)
            continue
        if score < 0 or score > 10:
            skipped_bad += 1
            print(f"{TAG} skip id={row.get('id')}: score out of range", flush=True)
            continue

        remark_raw = row.get("remark")
        remark = None if remark_raw is None else str(remark_raw)
        if remark is not None and not remark.strip():
            remark = None

        created_at = str(row.get("created_at") or "").strip() or None
        updated_at = str(row.get("updated_at") or "").strip() or created_at

        key = name_key(raw_name)
        already_teacher = key in teacher_map

        if args.dry_run:
            action_t = "reuse" if already_teacher else "create"
            print(
                f"{TAG} dry-run review id={row.get('id')} teacher={raw_name} ({action_t}) "
                f"date={class_date} score={score}",
                flush=True,
            )
            if not already_teacher:
                created_teachers += 1
                teacher_map[key] = -1  # mark as would-create
            continue

        before_ids = set(teacher_map.values())
        teacher_id = ensure_teacher(remote, raw_name, teacher_map)
        if teacher_id not in before_ids:
            created_teachers += 1

        if review_exists(remote, teacher_id, class_date, score, remark):
            skipped_reviews += 1
            continue

        ts_created = sql_quote(created_at) if created_at else "datetime('now')"
        ts_updated = sql_quote(updated_at) if updated_at else ts_created
        run_wrangler(
            remote,
            "INSERT INTO en_lesson_teacher_review "
            "(teacher_id, class_date, score, remark, created_at, updated_at) VALUES ("
            f"{int(teacher_id)}, "
            f"{sql_quote(class_date)}, "
            f"{int(score)}, "
            f"{sql_quote(remark)}, "
            f"{ts_created}, "
            f"{ts_updated}"
            ");",
        )
        inserted_reviews += 1
        print(
            f"{TAG} + review teacher_id={teacher_id} name={raw_name} "
            f"date={class_date} score={score} (from english_teacher_review.id={row.get('id')})",
            flush=True,
        )

    print(
        f"{TAG} done created_teachers={created_teachers} "
        f"inserted_reviews={inserted_reviews} skipped_reviews={skipped_reviews} "
        f"skipped_bad={skipped_bad}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"{TAG} error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
