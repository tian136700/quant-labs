#!/usr/bin/env python3
"""回归：英语抽背间隔重复（复用日语 SRS；写库 + 日序到期）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "src/lib/en-vocab-review.ts"
SHARED = ROOT / "src/lib/en-vocab-shared.ts"
DAILY = ROOT / "src/lib/en-vocab-daily-order.ts"
HELPERS = ROOT / "src/lib/en-vocab-db/helpers.ts"
WORDS = ROOT / "src/lib/en-vocab-db/words.ts"
STATE = ROOT / "src/lib/en-vocab-db/state.ts"
RULE = ROOT / ".cursor/rules/en-vocab-srs.mdc"
DAILY_RULE = ROOT / ".cursor/rules/en-vocab-daily-order-jp-priority.mdc"

errors: list[str] = []


def must_contain(path: Path, needle: str, msg: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        errors.append(f"{path.relative_to(ROOT)}: {msg}（缺「{needle[:70]}」）")


def must_match(path: Path, pattern: str, msg: str) -> None:
    text = path.read_text(encoding="utf-8")
    if not re.search(pattern, text, re.MULTILINE | re.DOTALL):
        errors.append(f"{path.relative_to(ROOT)}: {msg}")


def main() -> int:
    must_contain(REVIEW, "computeJpVocabSrsAfterReview", "勾选熟悉程度须写 SRS（复用日语）")
    must_contain(HELPERS, "srs_interval_days", "schema/SELECT 须含间隔列")
    must_contain(HELPERS, "srs_due_date", "schema/SELECT 须含到期列")
    must_contain(
        HELPERS,
        'addEnVocabWordColumnIfMissing(\n    db,\n    cols,\n    "srs_interval_days"',
        "须 ALTER 加间隔列",
    )
    must_contain(HELPERS, 'addEnVocabWordColumnIfMissing(db, cols, "srs_due_date"', "须 ALTER 加到期列")
    must_contain(HELPERS, "WORD_SELECT_POOL", "POOL SELECT 须存在")
    must_match(
        HELPERS,
        r"WORD_SELECT_POOL[\s\S]*srs_interval_days[\s\S]*srs_due_date",
        "POOL SELECT 须含 srs 列",
    )
    must_contain(WORDS, "srs_interval_days = ?8", "persist review 须写入间隔")
    must_contain(WORDS, "srs_due_date = ?9", "persist review 须写入到期日")
    must_contain(WORDS, "srs_interval_days = 0, srs_due_date = NULL", "全部重置须清 SRS")
    must_contain(STATE, "EN_VOCAB_WORD_SCHEMA_VERSION = 6", "schema 版本须含 srs 加列")

    must_contain(SHARED, "isJpVocabWordSrsDue", "日序须按是否到期排已抽查词")
    must_contain(SHARED, "jpVocabSrsDueSortKey", "日序须按到期日排序")
    must_contain(SHARED, "EligibleNeverQuizzedForFront", "日序仍须从未抽查置顶")
    must_match(
        SHARED,
        r"aDue !== bDue[\s\S]*aDue \? -1",
        "已到期须排在未到期之前",
    )
    must_contain(DAILY, 'jp_srs_v1', "order_algo 须升级为 jp_srs_v1 以强制重排")

    must_contain(RULE, "computeJpVocabSrsAfterReview", "须有英语 SRS 规则防复发")
    must_contain(RULE, "从未抽查", "规则须保留从未抽查置顶")
    must_contain(DAILY_RULE, "jp_srs_v1", "日序规则须写 jp_srs_v1")
    must_contain(DAILY_RULE, "SRS", "日序规则须点名 SRS 到期")

    if errors:
        print("check_en_vocab_srs: FAIL")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_en_vocab_srs: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
