#!/usr/bin/env python3
"""为已有 D1 库写入 en_vocab 角色默认权限（可重复执行）。"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"

EN_VOCAB_DEFAULT = (
    "en_vocab:read",
    "en_vocab:operate",
    "about:view",
    "nav:en_teacher",
)


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
    args = parser.parse_args()

    inserted = 0
    for key in EN_VOCAB_DEFAULT:
        sql = (
            "INSERT OR IGNORE INTO etr_role_permissions (role, permission_key) "
            f"VALUES ('en_vocab', '{key}');"
        )
        run_wrangler(args.remote, sql)
        inserted += 1

    print(f"Ensured {inserted} en_vocab default permissions ({'remote' if args.remote else 'local'}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
