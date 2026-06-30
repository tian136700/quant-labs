#!/usr/bin/env python3
"""为 jp_vocab_word 中 reading 为空的词条补全读音（已有读音的不改，可重复执行）。"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"

# 含汉字或特殊写法，需人工指定（hiragana/katakana 词条由规则自动推断）
MANUAL_READINGS: dict[str, str] = {
    "一つ": "ひとつ",
    "二つ": "ふたつ",
    "始まる": "はじまる",
    "怒る": "おこる",
    "守る": "まもる",
    "悪い": "わるい",
    "無理だ": "むりだ",
    "座る": "すわる",
    "薬局": "やっきょく",
    "暑い": "あつい",
    "見る": "みる",
    "お金": "おかね",
    "事": "こと",
    "大家": "おおや",
    "他/ほか": "ほか",
    "最近": "さいきん",
    "働く": "はたらく",
    "昼ごはん": "ひるごはん",
    "手": "て",
    "鍵屋": "かぎや",
    "綺麗だ": "きれいだ",
}

_KANA_OR_MARK = re.compile(
    r"^[\u3040-\u309F\u30A0-\u30FFー～〜/\s]+$"
)
_HAS_KANJI = re.compile(r"[\u4E00-\u9FFF]")


def sql_literal(value: str) -> str:
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


def fetch_missing(remote: bool) -> list[dict]:
    result = run_wrangler(
        remote,
        "SELECT id, word, kind FROM jp_vocab_word "
        "WHERE kind != 'grammar' "
        "AND (reading IS NULL OR TRIM(reading) = '') "
        "ORDER BY id;",
    )
    if isinstance(result, list) and result:
        return result[0].get("results") or []
    return []


def infer_reading(word: str) -> str | None:
    w = word.strip()
    if not w:
        return None
    if w in MANUAL_READINGS:
        return MANUAL_READINGS[w]
    if _KANA_OR_MARK.fullmatch(w):
        return w
    if _HAS_KANJI.search(w):
        return None
    return w


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--local", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.remote == args.local:
        print("请指定 --remote 或 --local", file=sys.stderr)
        return 1

    remote = args.remote
    label = "remote" if remote else "local"
    print(f"[migrate-jp-vocab-fill-reading] target={label}", flush=True)

    rows = fetch_missing(remote)
    if not rows:
        print("  无缺失读音的词条", flush=True)
        return 0

    updated = 0
    skipped: list[str] = []
    for row in rows:
        word_id = int(row["id"])
        word = str(row["word"])
        reading = infer_reading(word)
        if not reading:
            skipped.append(f"{word_id}:{word!r}")
            continue
        print(f"  {word_id} {word!r} -> {reading!r}", flush=True)
        if args.dry_run:
            updated += 1
            continue
        sql = (
            "UPDATE jp_vocab_word SET "
            f"reading = {sql_literal(reading)}, "
            "updated_at = datetime('now') "
            f"WHERE id = {word_id} "
            "AND (reading IS NULL OR TRIM(reading) = '');"
        )
        result = run_wrangler(remote, sql)
        rows_written = 0
        if isinstance(result, list) and result:
            meta = result[0].get("meta") or {}
            rows_written = int(meta.get("rows_written") or 0)
        updated += rows_written

    if skipped:
        print(f"  无法推断（需人工补全）: {', '.join(skipped)}", flush=True)
    print(
        f"[migrate-jp-vocab-fill-reading] done, "
        f"{'would update' if args.dry_run else 'updated'}: {updated}",
        flush=True,
    )
    return 0 if not skipped else 1


if __name__ == "__main__":
    raise SystemExit(main())
