#!/usr/bin/env python3
"""将 Cloudflare D1 线上库导出并覆盖写入本地库（用于本地预览真实数据）。"""

from __future__ import annotations

import argparse
import glob
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"
DUMP_PATH = ROOT / "tmp" / "remote-dump.sql"
INSERTS_PATH = ROOT / "tmp" / "remote-inserts.sql"
SCHEMA_PATH = ROOT / "schema.sql"
D1_STATE_DIR = ROOT / ".wrangler" / "state" / "v3" / "d1" / "miniflare-D1DatabaseObject"

JP_LESSON_INSERT = re.compile(r'^INSERT INTO "jp_lesson" ')
# learning, teacher_id(legacy), teacher_other — 去掉已废弃的 teacher_id 列
JP_LESSON_DROP_TEACHER_ID = re.compile(
    r"^(INSERT INTO \"jp_lesson\" \(.+\) VALUES\(.+?),(\d+),NULL,(NULL|'[^']*'|\d+),"
)


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    print(f"+ {' '.join(cmd)}", flush=True)
    proc = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    if proc.stdout.strip():
        print(proc.stdout.strip(), flush=True)
    if check and proc.returncode != 0:
        err = proc.stderr.strip() or proc.stdout.strip() or "command failed"
        raise RuntimeError(err)
    return proc


def wipe_local_d1() -> None:
    if not D1_STATE_DIR.is_dir():
        print(f"[sync] 本地 D1 目录不存在，跳过清理：{D1_STATE_DIR}", flush=True)
        return
    removed = 0
    for pattern in ("*.sqlite", "*.sqlite-wal", "*.sqlite-shm"):
        for path in glob.glob(str(D1_STATE_DIR / pattern)):
            Path(path).unlink(missing_ok=True)
            removed += 1
    print(f"[sync] 已清理本地 D1 文件 {removed} 个", flush=True)


def export_remote(output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            "npx",
            "wrangler",
            "d1",
            "export",
            DB,
            "--remote",
            "--output",
            str(output),
        ]
    )
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError(f"导出失败或文件为空：{output}")


def fix_jp_lesson_insert(line: str) -> str:
    line = line.replace('"teacher_id",', "")
    match = JP_LESSON_DROP_TEACHER_ID.match(line)
    if match:
        return f"{match.group(1)},{match.group(2)},{match.group(3)},"
    return line


def build_inserts_sql(source: Path, target: Path) -> int:
    count = 0
    target.parent.mkdir(parents=True, exist_ok=True)
    with source.open("r", encoding="utf-8") as src, target.open("w", encoding="utf-8") as out:
        out.write("PRAGMA foreign_keys=OFF;\n")
        for raw in src:
            line = raw.strip()
            if not line.startswith("INSERT INTO"):
                continue
            if JP_LESSON_INSERT.match(line):
                line = fix_jp_lesson_insert(line)
            out.write(line + "\n")
            count += 1
        out.write("PRAGMA foreign_keys=ON;\n")
    return count


def apply_schema_local() -> None:
    if not SCHEMA_PATH.is_file():
        raise RuntimeError(f"找不到 schema：{SCHEMA_PATH}")
    run(
        [
            "npx",
            "wrangler",
            "d1",
            "execute",
            DB,
            "--local",
            "--file",
            str(SCHEMA_PATH),
            "-y",
        ]
    )


def import_inserts_local(inserts: Path) -> None:
    run(
        [
            "npx",
            "wrangler",
            "d1",
            "execute",
            DB,
            "--local",
            "--file",
            str(inserts),
            "-y",
        ]
    )


def count_rows(table: str) -> int:
    proc = run(
        [
            "npx",
            "wrangler",
            "d1",
            "execute",
            DB,
            "--local",
            "--command",
            f"SELECT COUNT(*) AS c FROM {table};",
            "-y",
        ],
        check=False,
    )
    if proc.returncode != 0:
        return -1
    text = proc.stdout
    marker = '"c":'
    if marker not in text:
        return -1
    try:
        return int(text.split(marker, 1)[1].split(",", 1)[0].strip())
    except ValueError:
        return -1


def count_scheduled_lessons() -> int:
    proc = run(
        [
            "npx",
            "wrangler",
            "d1",
            "execute",
            DB,
            "--local",
            "--command",
            "SELECT COUNT(*) AS c FROM jp_lesson WHERE next_class_at IS NOT NULL AND TRIM(next_class_at) != '';",
            "-y",
        ],
        check=False,
    )
    if proc.returncode != 0:
        return -1
    text = proc.stdout
    marker = '"c":'
    if marker not in text:
        return -1
    try:
        return int(text.split(marker, 1)[1].split(",", 1)[0].strip())
    except ValueError:
        return -1


def main() -> int:
    parser = argparse.ArgumentParser(description="D1 线上 → 本地 全量同步")
    parser.add_argument(
        "--dump",
        type=Path,
        default=DUMP_PATH,
        help=f"导出 SQL 路径（默认 {DUMP_PATH.relative_to(ROOT)}）",
    )
    parser.add_argument(
        "--skip-export",
        action="store_true",
        help="跳过线上导出，仅用已有 dump 导入本地",
    )
    args = parser.parse_args()

    try:
        if not args.skip_export:
            print("[sync] 正在从线上导出…", flush=True)
            export_remote(args.dump)
            print(f"[sync] 已导出到 {args.dump} ({args.dump.stat().st_size // 1024} KB)", flush=True)

        if not args.dump.is_file():
            print(f"找不到 dump 文件：{args.dump}", file=sys.stderr)
            return 1

        print("[sync] 生成 INSERT 脚本…", flush=True)
        insert_count = build_inserts_sql(args.dump, INSERTS_PATH)
        print(f"[sync] 共 {insert_count} 条 INSERT → {INSERTS_PATH}", flush=True)

        print("[sync] 清理本地 D1…", flush=True)
        wipe_local_d1()

        print("[sync] 应用 schema.sql…", flush=True)
        apply_schema_local()

        print("[sync] 导入数据…", flush=True)
        import_inserts_local(INSERTS_PATH)

        for table in (
            "jp_lesson",
            "jp_lesson_teacher",
            "jp_lesson_teacher_link",
            "jp_vocab_ref",
            "etr_users",
        ):
            count = count_rows(table)
            if count >= 0:
                print(f"[sync] {table}: {count} 行", flush=True)

        scheduled = count_scheduled_lessons()
        if scheduled >= 0:
            print(f"[sync] jp_lesson 含预约时间: {scheduled} 条", flush=True)

        print(
            "\n[sync] 完成。请用本地 Cloudflare 预览查看真实数据：\n"
            "  npm run cf:preview\n"
            "然后打开 http://127.0.0.1:8787/jp-lesson/schedule\n"
            "（需用 Admin 账号登录；普通 npm run dev 不会读本地 D1）",
            flush=True,
        )
        return 0
    except RuntimeError as err:
        print(f"[sync] 失败：{err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
