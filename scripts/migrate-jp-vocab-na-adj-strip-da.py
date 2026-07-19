#!/usr/bin/env python3
"""把 jp_vocab_word 中な形容词「〜だ」剥成词干，读音同步去掉尾「だ」（可重复执行）。

规则与 src/lib/jp-vocab-na-adj.ts 一致：
- 仅词尾「だ」且词干含汉字（重要だ→重要；だから / ～だから 不动）
- 读音若以「だ」结尾则去掉（じゅうようだ→じゅうよう）
- 剥完后若与已有词条撞名则跳过

用法：
  python3 scripts/migrate-jp-vocab-na-adj-strip-da.py --remote
  python3 scripts/migrate-jp-vocab-na-adj-strip-da.py --local --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"
HAS_KANJI = re.compile(r"[\u4E00-\u9FFF]")
DA_ADJ = re.compile(r"^(.+)だ$")


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


def sql_literal(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def normalize(word: str, reading: str | None) -> tuple[str, str | None] | None:
    w = (word or "").strip()
    m = DA_ADJ.match(w)
    if not m or not m.group(1).strip() or not HAS_KANJI.search(m.group(1)):
        return None
    stem = m.group(1).strip()
    r = (reading or "").strip() or None
    if r and r.endswith("だ") and len(r) > 1:
        r = r[:-1] or None
    if stem == w and r == ((reading or "").strip() or None):
        return None
    return stem, r


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
    print(f"[migrate-jp-vocab-na-adj-strip-da] target={label} dry_run={args.dry_run}", flush=True)

    raw = run_wrangler(
        remote,
        "SELECT id, word, reading FROM jp_vocab_word WHERE word LIKE '%だ' ORDER BY id;",
    )
    rows = []
    if isinstance(raw, list) and raw:
        rows = raw[0].get("results") or []

    updated = 0
    skipped = 0
    for row in rows:
        wid = int(row["id"])
        word = str(row.get("word") or "")
        reading = row.get("reading")
        reading = str(reading).strip() if reading is not None else None
        if reading == "":
            reading = None
        nxt = normalize(word, reading)
        if not nxt:
            continue
        stem, next_reading = nxt

        dup_raw = run_wrangler(
            remote,
            f"SELECT id FROM jp_vocab_word WHERE word = {sql_literal(stem)} AND id != {wid} LIMIT 1;",
        )
        dup_rows = []
        if isinstance(dup_raw, list) and dup_raw:
            dup_rows = dup_raw[0].get("results") or []
        if dup_rows:
            print(f"  skip id={wid} {word!r} → {stem!r} (duplicate)", flush=True)
            skipped += 1
            continue

        print(
            f"  {'would update' if args.dry_run else 'update'} "
            f"id={wid} {word!r}/{reading!r} → {stem!r}/{next_reading!r}",
            flush=True,
        )
        if not args.dry_run:
            run_wrangler(
                remote,
                "UPDATE jp_vocab_word SET "
                f"word = {sql_literal(stem)}, "
                f"reading = {sql_literal(next_reading)}, "
                f"updated_at = datetime('now') WHERE id = {wid};",
            )
        updated += 1

    print(
        f"[migrate-jp-vocab-na-adj-strip-da] done updated={updated} skipped={skipped}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
