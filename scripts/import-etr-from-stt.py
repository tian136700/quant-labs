#!/usr/bin/env python3
"""
从 STT 项目 stt.sqlite 导入 english_teacher_review 到 Cloudflare D1。

用法:
  python3 scripts/import-etr-from-stt.py --local
  python3 scripts/import-etr-from-stt.py --remote

环境变量:
  STT_SQLITE_PATH  源库路径，默认 ../../../wq-code/stt/stt.sqlite
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_STT_DB = (ROOT / "../../wq-code/stt/stt.sqlite").resolve()


def sql_quote(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def load_rows(db_path: Path) -> list[dict]:
    if not db_path.is_file():
        raise FileNotFoundError(f"STT 数据库不存在: {db_path}")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, teacher_name, class_date, score, remark, created_at, updated_at
            FROM english_teacher_review
            ORDER BY id ASC
            """
        )
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def build_sql(rows: list[dict]) -> str:
    lines = [
        "-- 从 STT stt.sqlite 导入英语老师评价（可重复执行）",
        "PRAGMA foreign_keys = OFF;",
    ]
    for row in rows:
        lines.append(
            "INSERT OR REPLACE INTO english_teacher_review "
            "(id, teacher_name, class_date, score, remark, created_at, updated_at) VALUES ("
            f"{int(row['id'])}, "
            f"{sql_quote(row['teacher_name'])}, "
            f"{sql_quote(row['class_date'])}, "
            f"{int(row['score'])}, "
            f"{sql_quote(row.get('remark'))}, "
            f"{sql_quote(row.get('created_at') or '')}, "
            f"{sql_quote(row.get('updated_at') or '')}"
            ");"
        )
    if rows:
        max_id = max(int(r["id"]) for r in rows)
        lines.append(
            "DELETE FROM sqlite_sequence WHERE name='english_teacher_review';"
        )
        lines.append(
            f"INSERT INTO sqlite_sequence (name, seq) VALUES ('english_teacher_review', {max_id});"
        )
    lines.append("PRAGMA foreign_keys = ON;")
    return "\n".join(lines) + "\n"


def run_wrangler(sql_path: Path, remote: bool) -> None:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        "strategy-compare-db",
        "--file",
        str(sql_path),
    ]
    if remote:
        cmd.append("--remote")
    else:
        cmd.append("--local")

    print("执行:", " ".join(cmd))
    subprocess.run(cmd, cwd=ROOT, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Import english_teacher_review from STT sqlite to D1")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--local", action="store_true", help="写入本地 D1")
    target.add_argument("--remote", action="store_true", help="写入线上 D1")
    parser.add_argument(
        "--stt-db",
        default=os.environ.get("STT_SQLITE_PATH", str(DEFAULT_STT_DB)),
        help="STT sqlite 路径",
    )
    args = parser.parse_args()

    stt_db = Path(args.stt_db).expanduser().resolve()
    rows = load_rows(stt_db)
    if not rows:
        print(f"源库无评价记录: {stt_db}")
        return 0

    sql = build_sql(rows)
    print(f"源库: {stt_db}")
    print(f"待导入记录数: {len(rows)}")

    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".sql",
        prefix="import-etr-",
        delete=False,
        encoding="utf-8",
    ) as f:
        f.write(sql)
        tmp = Path(f.name)

    try:
        run_wrangler(tmp, remote=args.remote)
    finally:
        tmp.unlink(missing_ok=True)

    print("导入完成。")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as e:
        print(f"wrangler 执行失败，退出码 {e.returncode}", file=sys.stderr)
        raise SystemExit(e.returncode)
    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        raise SystemExit(1)
