#!/usr/bin/env python3
"""回归：释义补全热路径不得每秒全表 TRIM / 无缓存 na-adj / 无限制 limit。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    meaning = (ROOT / "src/lib/jp-vocab-fill-meaning.ts").read_text(encoding="utf-8")
    na_adj = (ROOT / "src/lib/jp-vocab-na-adj-db.ts").read_text(encoding="utf-8")
    route = (
        ROOT / "src/app/api/jp-vocab/fill-meaning/route.ts"
    ).read_text(encoding="utf-8")
    script = (ROOT / "scripts/jp-vocab-fill-meaning-api.py").read_text(encoding="utf-8")
    errors: list[str] = []

    if "TRIM(meaning)" in meaning:
        errors.append("jp-vocab-fill-meaning.ts 仍用 TRIM(meaning)（热路径易 1102）")
    if "Math.min(rawLimit, 5)" not in meaning and "Math.min(rawLimit, 5)" not in route:
        if "Math.min(Math.floor(body.limit), 5)" not in route:
            errors.append("fill-meaning limit 未硬顶 ≤5")
    if "naAdjNormalizeCleanUntil" not in na_adj:
        errors.append("jp-vocab-na-adj-db.ts 缺 isolate TTL 缓存（list_missing 会每秒全表扫）")
    if "db.batch" not in na_adj:
        errors.append("jp-vocab-na-adj-db.ts 更新未用 db.batch")
    if "禁止每轮再打一次 list_missing probe" not in script and "不再 probe" not in script:
        if 'body={"mode": "list_missing", "limit": 1}' in script.split("if args.loop")[-1]:
            errors.append("jp-vocab-fill-meaning-api.py --loop 仍每轮二次 list_missing probe")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1
    print("ok: jp-vocab fill-meaning hotpath guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
