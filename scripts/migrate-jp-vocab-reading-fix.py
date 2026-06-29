#!/usr/bin/env python3
"""修正 jp_vocab_word 中 word/reading 写反或 OCR 误识别的读音（可重复执行）。"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"

# (WHERE word, WHERE reading or None, new_word, new_reading)
# new_reading 为 "" 表示置 NULL
FIXES: list[tuple[str, str | None, str, str | None]] = [
    ("はじめまして", "初めまして", "初めまして", "はじめまして"),
    ("ドイツ", "どういつ", "ドイツ", "ドイツ"),
    ("失礼ですが", "打抗一下", "失礼ですが", "しつれいですが"),
    ("失礼ですが", "打扰一下", "失礼ですが", "しつれいですが"),
    ("だれ", "どなた", "だれ", "だれ"),
    ("なんぷん", "分", "なんぷん", None),
    ("どようび", "土曜日", "土曜日", "どようび"),
    ("かようび", "火曜日", "火曜日", "かようび"),
    ("すいようび", "水曜日", "水曜日", "すいようび"),
    ("やすみ", "休み", "休み", "やすみ"),
    ("けさ", "今朝", "今朝", "けさ"),
    ("あさって", "明後日", "明後日", "あさって"),
]


def sql_literal(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


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


def build_update(
    where_word: str,
    where_reading: str | None,
    new_word: str,
    new_reading: str | None,
) -> str:
    cond = f"word = {sql_literal(where_word)}"
    if where_reading is not None:
        cond += f" AND reading = {sql_literal(where_reading)}"
    return (
        "UPDATE jp_vocab_word SET "
        f"word = {sql_literal(new_word)}, "
        f"reading = {sql_literal(new_reading)}, "
        "updated_at = datetime('now') "
        f"WHERE {cond};"
    )


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
    print(f"[migrate-jp-vocab-reading-fix] target={label}", flush=True)

    changed = 0
    for where_word, where_reading, new_word, new_reading in FIXES:
        sql = build_update(where_word, where_reading, new_word, new_reading)
        result = run_wrangler(remote, sql)
        rows_written = 0
        if isinstance(result, list) and result:
            meta = result[0].get("meta") or {}
            rows_written = int(meta.get("rows_written") or 0)
        if rows_written:
            changed += rows_written
            print(
                f"  fixed {where_word!r} / {where_reading!r} -> "
                f"{new_word!r} / {new_reading!r}",
                flush=True,
            )

    print(f"[migrate-jp-vocab-reading-fix] done, rows updated: {changed}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
