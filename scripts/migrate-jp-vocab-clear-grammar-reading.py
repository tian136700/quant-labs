#!/usr/bin/env python3
"""清空 jp_vocab_word 中所有语法（kind=grammar）条目的读音（可重复执行）。"""

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
    print(f"[migrate-jp-vocab-clear-grammar-reading] target={label}", flush=True)

    result = run_wrangler(
        remote,
        "UPDATE jp_vocab_word SET reading = NULL, updated_at = datetime('now') "
        "WHERE kind = 'grammar' AND reading IS NOT NULL AND TRIM(reading) != '';",
    )
    rows_written = 0
    if isinstance(result, list) and result:
        meta = result[0].get("meta") or {}
        rows_written = int(meta.get("rows_written") or 0)

    print(
        f"[migrate-jp-vocab-clear-grammar-reading] done, cleared: {rows_written}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
