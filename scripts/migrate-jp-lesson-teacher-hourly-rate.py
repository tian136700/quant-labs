#!/usr/bin/env python3
"""jp_lesson_teacher.hourly_rate 列 + 从旧版「名称-80/h」拆分数据（可重复执行）。"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"
DASH_PATTERN = re.compile(r"[-－—]")


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


def parse_hourly_rate_from_suffix(suffix: str) -> float | None:
    text = suffix.strip()
    if not text:
        return None

    per_session = re.search(r"^([\d.]+)\s*/\s*([\d.]+)\s*min", text, re.I)
    if per_session:
        try:
            price = float(per_session.group(1))
            minutes = float(per_session.group(2))
        except ValueError:
            price = minutes = 0
        if price > 0 and minutes > 0:
            return round(price / minutes * 60, 2)

    per_hour = re.search(r"([\d.]+)\s*元?\s*/\s*h\b", text, re.I)
    if per_hour:
        try:
            value = float(per_hour.group(1))
        except ValueError:
            value = 0
        if value > 0:
            return round(value, 2)

    return None


def split_name_rate(name: str) -> tuple[str, float | None]:
    trimmed = name.strip()
    match = DASH_PATTERN.search(trimmed)
    if not match or match.start() <= 0:
        return trimmed, None

    base = trimmed[: match.start()].strip()
    suffix = trimmed[match.end() :].strip()
    rate = parse_hourly_rate_from_suffix(suffix)
    if rate is None:
        return trimmed, None
    return base or trimmed, rate


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
    print(f"[migrate-jp-lesson-teacher-hourly-rate] target={label}", flush=True)

    if not column_exists(remote, "jp_lesson_teacher", "hourly_rate"):
        run_wrangler(
            remote,
            "ALTER TABLE jp_lesson_teacher ADD COLUMN hourly_rate REAL;",
        )
        print("[migrate-jp-lesson-teacher-hourly-rate] added hourly_rate column", flush=True)
    else:
        print("[migrate-jp-lesson-teacher-hourly-rate] hourly_rate exists, skip add", flush=True)

    rows = run_wrangler(
        remote,
        "SELECT id, name, hourly_rate FROM jp_lesson_teacher ORDER BY id ASC;",
    )
    teachers = []
    if isinstance(rows, list) and rows:
        teachers = rows[0].get("results") or []

    name_to_id: dict[str, int] = {
        str(row.get("name") or ""): int(row["id"]) for row in teachers
    }

    updated = 0
    skipped_rename = 0
    for row in teachers:
        teacher_id = int(row["id"])
        name = str(row.get("name") or "")
        hourly_rate = row.get("hourly_rate")

        base_name, parsed_rate = split_name_rate(name)
        has_legacy_format = DASH_PATTERN.search(name) is not None
        needs_rate = parsed_rate is not None and (
            hourly_rate is None or has_legacy_format
        )
        wants_rename = base_name != name and has_legacy_format

        if not needs_rate and not wants_rename:
            continue

        target_name = base_name if wants_rename else name
        if wants_rename and base_name in name_to_id and name_to_id[base_name] != teacher_id:
            target_name = name
            wants_rename = False
            skipped_rename += 1
            print(
                f"[migrate-jp-lesson-teacher-hourly-rate] id={teacher_id} "
                f"skip rename to '{base_name}' (taken by id={name_to_id[base_name]})",
                flush=True,
            )

        rate_sql = "NULL"
        if needs_rate and parsed_rate is not None:
            rate_sql = str(parsed_rate)
        elif hourly_rate is not None:
            rate_sql = str(hourly_rate)

        if not wants_rename and not needs_rate:
            continue

        safe_name = target_name.replace("'", "''")
        run_wrangler(
            remote,
            f"UPDATE jp_lesson_teacher SET name = '{safe_name}', hourly_rate = {rate_sql}, updated_at = datetime('now') WHERE id = {teacher_id};",
        )

        if wants_rename:
            if name in name_to_id and name_to_id[name] == teacher_id:
                del name_to_id[name]
            name_to_id[target_name] = teacher_id

        updated += 1
        print(
            f"[migrate-jp-lesson-teacher-hourly-rate] id={teacher_id} "
            f"'{name}' -> name='{target_name}', hourly_rate={parsed_rate if needs_rate else hourly_rate}",
            flush=True,
        )

    print(
        f"[migrate-jp-lesson-teacher-hourly-rate] updated {updated} row(s), "
        f"skipped rename {skipped_rename} time(s), done",
        flush=True,
    )

    # 首轮迁移把「60/45min」误存为 60/h，按原格式重算
    known_rate_fixes: dict[int, float] = {
        15: round(60 / 45 * 60, 2),  # 怡老师-60/45min
        17: 55.0,  # 乐老师—日语 55/h（首轮只改了名未写入费率）
        18: round(50 / 45 * 60, 2),  # 宁老师-50/45min
    }
    fixed = 0
    for teacher_id, rate in known_rate_fixes.items():
        run_wrangler(
            remote,
            f"UPDATE jp_lesson_teacher SET hourly_rate = {rate}, updated_at = datetime('now') WHERE id = {teacher_id};",
        )
        fixed += 1
        print(
            f"[migrate-jp-lesson-teacher-hourly-rate] fix id={teacher_id} hourly_rate={rate}",
            flush=True,
        )
    if fixed:
        print(f"[migrate-jp-lesson-teacher-hourly-rate] corrected {fixed} known rate(s)", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
