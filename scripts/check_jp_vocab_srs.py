#!/usr/bin/env python3
"""回归：日语抽问间隔重复（srs_interval_days / srs_due_date）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRS = ROOT / "src/lib/jp-vocab-srs.ts"
REVIEW = ROOT / "src/lib/jp-vocab-review.ts"
SHARED = ROOT / "src/lib/jp-vocab-shared.ts"
HELPERS = ROOT / "src/lib/jp-vocab-db/helpers.ts"
WORDS = ROOT / "src/lib/jp-vocab-db/words.ts"
REVIEW_RECORD = ROOT / "src/lib/jp-vocab-db/review_record.ts"
TYPES = ROOT / "src/lib/types.ts"
RULE = ROOT / ".cursor/rules/jp-vocab-srs.mdc"

errors: list[str] = []


def must_contain(path: Path, needle: str, msg: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        errors.append(f"{path.relative_to(ROOT)}: {msg}（缺「{needle[:70]}」）")


def must_match(path: Path, pattern: str, msg: str) -> None:
    text = path.read_text(encoding="utf-8")
    if not re.search(pattern, text, re.MULTILINE | re.DOTALL):
        errors.append(f"{path.relative_to(ROOT)}: {msg}")


def test_ladder_logic() -> None:
    """与 jp-vocab-srs.ts 阶梯一致的纯 Python 对照。"""
    steps = [10, 20, 30, 60, 120, 180, 365]

    def next_very(base: int) -> int:
        for step in steps:
            if step > base:
                return step
        return steps[-1]

    if next_very(0) != 10:
        errors.append(f"first very expected 10, got {next_very(0)}")
    if next_very(10) != 20:
        errors.append(f"second very expected 20, got {next_very(10)}")
    if next_very(20) != 30:
        errors.append(f"third very expected 30, got {next_very(20)}")
    if next_very(365) != 365:
        errors.append(f"cap very expected 365, got {next_very(365)}")


def main() -> int:
    test_ladder_logic()

    must_contain(TYPES, "srs_interval_days", "JpVocabWord 须有间隔字段")
    must_contain(TYPES, "srs_due_date", "JpVocabWord 须有下次到期日字段")

    must_contain(SRS, "JP_VOCAB_SRS_VERY_STEPS", "须有非常熟悉阶梯")
    must_contain(SRS, "10, 20, 30", "阶梯须含 10→20→30")
    must_contain(SRS, "computeJpVocabSrsAfterReview", "须有勾选后计算间隔")
    must_contain(SRS, "isJpVocabWordSrsDue", "须有到期判断")

    must_contain(REVIEW, "computeJpVocabSrsAfterReview", "勾选熟悉程度须写 SRS")
    must_contain(HELPERS, "srs_interval_days", "schema/SELECT 须含间隔列")
    must_contain(HELPERS, "srs_due_date", "schema/SELECT 须含到期列")
    must_contain(HELPERS, "ALTER TABLE jp_vocab_word ADD COLUMN srs_interval_days", "须 ALTER 加间隔列")
    must_contain(HELPERS, "ALTER TABLE jp_vocab_word ADD COLUMN srs_due_date", "须 ALTER 加到期列")
    must_contain(REVIEW_RECORD, "srs_interval_days = ?8", "record review 须写入间隔")
    must_contain(REVIEW_RECORD, "srs_due_date = ?9", "record review 须写入到期日")

    must_contain(SHARED, "isJpVocabWordSrsDue", "日序须按是否到期排已抽查词")
    must_contain(SHARED, "EligibleNeverQuizzedForFront", "日序仍须从未抽查置顶")
    must_match(
        SHARED,
        r"aDue !== bDue[\s\S]*aDue \? -1",
        "已到期须排在未到期之前",
    )

    must_contain(RULE, "srs_due_date", "须有 SRS 规则防复发")
    must_contain(RULE, "从未抽查", "规则须保留从未抽查置顶")

    if errors:
        print("check_jp_vocab_srs: FAIL")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_jp_vocab_srs: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
