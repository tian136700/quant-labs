#!/usr/bin/env python3
"""jp-vocab 语法/教案：仅增量迁移，不删表、不清数据。

- 新建 jp_vocab_ref（若不存在）
- jp_vocab_word 增加 kind / ref_key（若不存在）
- 已有单词行自动得到 kind='word'、ref_key=NULL
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"


def run_wrangler(remote: bool, sql: str) -> dict:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB,
        "--command",
        sql,
        "-y",
    ]
    if remote:
        cmd.append("--remote")
    else:
        cmd.append("--local")

    proc = subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "wrangler failed")

    # wrangler 可能把 JSON 混在 stdout 里
    text = proc.stdout.strip()
    start = text.find("[")
    if start >= 0:
        return json.loads(text[start:])
    return {"stdout": text}


def table_columns(remote: bool, table: str) -> set[str]:
    rows = run_wrangler(
        remote,
        f"PRAGMA table_info({table});",
    )
    # wrangler json: list of result sets
    if isinstance(rows, list) and rows:
        results = rows[0].get("results") or []
        return {str(r.get("name")) for r in results if r.get("name")}
    return set()


def main() -> int:
    parser = argparse.ArgumentParser(description="Safe incremental jp-vocab refs migration")
    parser.add_argument("--remote", action="store_true", help="Migrate production D1")
    parser.add_argument("--local", action="store_true", help="Migrate local D1")
    args = parser.parse_args()
    if args.remote == args.local:
        print("请指定 --remote 或 --local 之一", file=sys.stderr)
        return 1

    remote = args.remote
    label = "remote" if remote else "local"
    print(f"[migrate-jp-vocab-refs] target={label}", flush=True)

    before = run_wrangler(remote, "SELECT COUNT(*) AS c FROM jp_vocab_word;")
    count_before = None
    if isinstance(before, list) and before:
        count_before = before[0].get("results", [{}])[0].get("c")
    print(f"[migrate-jp-vocab-refs] jp_vocab_word rows before: {count_before}", flush=True)

    run_wrangler(
        remote,
        """
        CREATE TABLE IF NOT EXISTS jp_vocab_ref (
          ref_key    TEXT PRIMARY KEY,
          title      TEXT,
          media_type TEXT NOT NULL DEFAULT 'image',
          r2_key     TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """.strip(),
    )
    print("[migrate-jp-vocab-refs] jp_vocab_ref OK", flush=True)

    cols = table_columns(remote, "jp_vocab_word")
    if "kind" not in cols:
        run_wrangler(
            remote,
            "ALTER TABLE jp_vocab_word ADD COLUMN kind TEXT NOT NULL DEFAULT 'word';",
        )
        print("[migrate-jp-vocab-refs] added column kind", flush=True)
    else:
        print("[migrate-jp-vocab-refs] column kind already exists, skip", flush=True)

    cols = table_columns(remote, "jp_vocab_word")
    if "ref_key" not in cols:
        run_wrangler(
            remote,
            "ALTER TABLE jp_vocab_word ADD COLUMN ref_key TEXT;",
        )
        print("[migrate-jp-vocab-refs] added column ref_key", flush=True)
    else:
        print("[migrate-jp-vocab-refs] column ref_key already exists, skip", flush=True)

    run_wrangler(
        remote,
        "CREATE INDEX IF NOT EXISTS idx_jp_vocab_ref_key ON jp_vocab_word (ref_key);",
    )
    print("[migrate-jp-vocab-refs] index OK", flush=True)

    after = run_wrangler(remote, "SELECT COUNT(*) AS c FROM jp_vocab_word;")
    count_after = None
    if isinstance(after, list) and after:
        count_after = after[0].get("results", [{}])[0].get("c")
    print(f"[migrate-jp-vocab-refs] jp_vocab_word rows after: {count_after}", flush=True)

    if count_before is not None and count_after is not None and count_before != count_after:
        print(
            f"ERROR: row count changed {count_before} -> {count_after}",
            file=sys.stderr,
        )
        return 2

    print("[migrate-jp-vocab-refs] done (no data deleted)", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
