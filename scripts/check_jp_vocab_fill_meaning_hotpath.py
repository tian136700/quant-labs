#!/usr/bin/env python3
"""回归：释义补全热路径不得每秒全表 TRIM / 无缓存 na-adj / 无限制 limit。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    meaning = (ROOT / "src/lib/jp-vocab-fill-meaning.ts").read_text(encoding="utf-8")
    ai = (ROOT / "src/lib/jp-vocab-meaning-ai.ts").read_text(encoding="utf-8")
    na_adj = (ROOT / "src/lib/jp-vocab-na-adj-db.ts").read_text(encoding="utf-8")
    route = (
        ROOT / "src/app/api/jp-vocab/fill-meaning/route.ts"
    ).read_text(encoding="utf-8")
    script = (ROOT / "scripts/jp-vocab-fill-meaning-api.py").read_text(encoding="utf-8")
    errors: list[str] = []

    if "normalizeJpVocabNaAdjRowsInDb" in meaning:
        errors.append("jp-vocab-fill-meaning.ts 仍调用 normalizeJpVocabNaAdjRowsInDb（释义不需要剥だ）")
    if "TRIM(meaning)" in meaning:
        errors.append("jp-vocab-fill-meaning.ts 仍用 TRIM(meaning)（热路径易 1102）")
    if "Math.min(rawLimit, 20)" not in meaning and "Math.min(Math.floor(body.limit), 20)" not in route:
        errors.append("fill-meaning limit 未硬顶 ≤20")
    if "LIST_CANDIDATE_LIMIT" not in script or "FILL_PER_ROUND" not in script:
        errors.append("脚本缺 LIST_CANDIDATE_LIMIT/FILL_PER_ROUND（防毒丸队首卡死）")
    if "need_pos" not in meaning or "need_examples" not in meaning:
        errors.append("jp-vocab-fill-meaning.ts 缺 need_pos/need_examples（释义应顺带检测词性/例句）")
    if "need_pos" not in ai or "need_examples" not in ai:
        errors.append("jp-vocab-meaning-ai.ts prompt 未支持 need_pos/need_examples")
    if "parse_combo_output" not in script or "example_sentences" not in script:
        errors.append("脚本未解析/写回 example_sentences（顺带补例句）")
    if "naAdjNormalizeCleanUntil" not in na_adj:
        errors.append("jp-vocab-na-adj-db.ts 缺 isolate TTL 缓存（例句等 list_missing 用）")
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
