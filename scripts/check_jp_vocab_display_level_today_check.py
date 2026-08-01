#!/usr/bin/env python3
"""回归：日语熟悉程度回显须在丢 round_checked 时仍认今日 today_check（对齐英语）。

曾复发：管理员把今日抽查数量 10→15 后，已勾词（如「～なら」）又进待抽队列，
老师被迫再勾一次。根因是 effectiveJpVocabDisplayLevel 只认 round_checked_ids，
sync/缓存短暂丢该列表时 hasLevel=false。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "src/lib/jp-vocab-review.ts"
EN_REVIEW = ROOT / "src/lib/en-vocab-review.ts"
RULE = ROOT / ".cursor/rules/jp-vocab-display-level-today-check.mdc"
QUIZ_HOOK = ROOT / "src/hooks/useJpVocabTeacherQuiz.ts"

errors: list[str] = []


def must_contain(path: Path, needle: str, msg: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        errors.append(f"{path.relative_to(ROOT)}: {msg}（缺「{needle[:80]}」）")


def must_match(path: Path, pattern: str, msg: str) -> None:
    text = path.read_text(encoding="utf-8")
    if not re.search(pattern, text, re.MULTILINE | re.DOTALL):
        errors.append(f"{path.relative_to(ROOT)}: {msg}")


def must_not_match(path: Path, pattern: str, msg: str) -> None:
    text = path.read_text(encoding="utf-8")
    if re.search(pattern, text, re.MULTILINE | re.DOTALL):
        errors.append(f"{path.relative_to(ROOT)}: {msg}")


def main() -> int:
    # 禁止旧写法：有 displayOrder 就只靠 round_checked 一票否决
    must_not_match(
        REVIEW,
        r"if\s*\(\s*!isJpVocabRoundChecked\(order,\s*word\.id\)\s*\)\s*return\s+undefined\s*;",
        "禁止仅因缺少 round_checked 就 return undefined（须同时看今日 today_check）",
    )

    must_contain(REVIEW, "isJpVocabWordQuizzedToday", "须用今日抽查计次兜底")
    must_match(
        REVIEW,
        r"!isJpVocabRoundChecked\(order,\s*word\.id\)\s*&&\s*!isJpVocabWordQuizzedToday\(word,\s*now\)",
        "round_checked 缺失时须用 isJpVocabWordQuizzedToday 兜底",
    )

    # 英语对照仍须保留同逻辑（防两边再度分叉）
    must_match(
        EN_REVIEW,
        r"!isEnVocabRoundChecked\(order,\s*word\.id\)\s*&&\s*!hasEnVocabTodayCheckCounted\(word,\s*now\)",
        "英语 effectiveEnVocabDisplayLevel 须保留 today_check 兜底",
    )

    must_contain(
        QUIZ_HOOK,
        "effectiveJpVocabDisplayLevel",
        "老师抽查 hasLevel 须走 effectiveJpVocabDisplayLevel",
    )

    must_contain(RULE, "today_check", "须有防复发规则")
    must_contain(RULE, "round_checked", "规则须点名 round_checked 陷阱")

    if errors:
        print("FAIL: jp-vocab display level today_check guard")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("OK: jp-vocab display level falls back to today_check when round_checked missing")
    return 0


if __name__ == "__main__":
    sys.exit(main())
