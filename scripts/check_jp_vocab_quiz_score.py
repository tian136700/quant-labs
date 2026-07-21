#!/usr/bin/env python3
"""回归：日语抽问 final_score = priority + days × weight（久未复习抬升）。"""

from __future__ import annotations

import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCORE = ROOT / "src/lib/jp-vocab-quiz-score.ts"
SHARED = ROOT / "src/lib/jp-vocab-shared.ts"
DB = ROOT / "src/lib/jp-vocab-db.ts"
ROUTE = ROOT / "src/app/api/jp-vocab/route.ts"
PAGE = ROOT / "src/components/JpVocabPage.tsx"
ADMIN_UI = ROOT / "src/components/JpVocabQuizTimeWeightAdmin.tsx"
EXCEL = ROOT / "src/lib/jp-vocab-excel-export.ts"
RISK = ROOT / "src/lib/jp-vocab-risk.ts"
CACHE = ROOT / "src/lib/jp-vocab-page-cache.ts"
RULE = ROOT / ".cursor/rules/jp-vocab-quiz-time-weight.mdc"

errors: list[str] = []


def must_contain(path: Path, needle: str, msg: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        errors.append(f"{path.relative_to(ROOT)}: {msg}（缺「{needle[:60]}」）")


def must_match(path: Path, pattern: str, msg: str) -> None:
    text = path.read_text(encoding="utf-8")
    if not re.search(pattern, text, re.MULTILINE | re.DOTALL):
        errors.append(f"{path.relative_to(ROOT)}: {msg}")


def round1(x: float) -> float:
    return round(x * 10) / 10


def test_formula_sample() -> None:
    """priority=-3（cnt_very=10）、days=40、weight=0.1 → final=1.0"""
    priority = round1(0 * 1 + 0 * 2 - 10 * 0.3)  # -3.0
    final = round1(priority + 40 * 0.1)
    if not math.isclose(priority, -3.0):
        errors.append(f"formula: expected priority -3.0, got {priority}")
    if not math.isclose(final, 1.0):
        errors.append(f"formula: expected final 1.0 for -3+40*0.1, got {final}")


def main() -> int:
    test_formula_sample()

    must_contain(SCORE, "jpVocabFinalQuizScore", "须导出 final_score 函数")
    must_contain(SCORE, "jpVocabDaysSinceLastReview", "须有距上次抽问天数")
    must_contain(SCORE, "JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT = 0.1", "默认权重 0.1")
    must_contain(SCORE, "last_review_at", "天数优先用 last_review_at，勿新建日期列")
    must_match(
        SCORE,
        r"priority\s*\+\s*days\s*\*\s*weight|days\s*\*\s*weight",
        "final_score 须为 priority + days × weight",
    )

    must_contain(
        SHARED,
        "jpVocabFinalQuizScore",
        "日序须用 final_score，禁止只按 raw risk",
    )
    must_contain(
        SHARED,
        "sortJpVocabWordsForDailyOrder",
        "日序入口须存在",
    )
    must_match(
        SHARED,
        r"jpVocabFinalQuizScore\(b,\s*weight",
        "日序比较须调用 jpVocabFinalQuizScore",
    )

    must_contain(DB, "getJpVocabQuizTimeWeight", "DB 须可读时间权重")
    must_contain(DB, "setJpVocabQuizTimeWeight", "DB 须可写时间权重")
    must_contain(DB, "JP_VOCAB_QUIZ_TIME_WEIGHT_KEY", "DB 须用 setting key 常量")
    must_contain(SCORE, 'JP_VOCAB_QUIZ_TIME_WEIGHT_KEY = "quiz_time_weight"', "setting key 须为 quiz_time_weight")

    must_contain(ROUTE, 'set_quiz_time_weight', "API 须有 set_quiz_time_weight")
    must_contain(ROUTE, "quiz_time_weight", "GET 须返回 quiz_time_weight")

    must_contain(ADMIN_UI, "JpVocabQuizTimeWeightAdmin", "管理员权重 UI 组件")
    must_contain(PAGE, "JpVocabQuizTimeWeightAdmin", "管理员页须挂权重控件")
    must_contain(PAGE, "set_quiz_time_weight", "管理员页须 POST 保存权重")
    must_contain(PAGE, "quizTimeWeight={quizTimeWeight}", "表格/卡片须传入权重")

    must_contain(CACHE, "quiz_time_weight", "本地缓存须保留权重")
    must_contain(RISK, "jpVocabFinalQuizScore", "排行图须按 final_score")
    must_contain(EXCEL, "最终抽问得分", "Excel 须导出 final_score 列")
    must_contain(EXCEL, "距上次抽问天数", "Excel 须导出天数列")
    must_contain(RULE, "禁止", "须有 cursor 规则防复发")

    # 禁止日序文件又退化成只比 risk
    shared = SHARED.read_text(encoding="utf-8")
    # 在 sortJpVocabWordsForDailyOrder 函数体内应出现 FinalQuizScore
    m = re.search(
        r"export function sortJpVocabWordsForDailyOrder\([\s\S]*?\n\}",
        shared,
    )
    if not m or "jpVocabFinalQuizScore" not in m.group(0):
        errors.append(
            "jp-vocab-shared.ts: sortJpVocabWordsForDailyOrder 未使用 jpVocabFinalQuizScore"
        )
    if m and re.search(
        r"jpVocabRiskIndex\(b\)\s*-\s*jpVocabRiskIndex\(a\)", m.group(0)
    ):
        errors.append(
            "jp-vocab-shared.ts: 日序仍用 raw jpVocabRiskIndex 比较（应改 final_score）"
        )

    if errors:
        print("FAIL: jp-vocab quiz score checks")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("OK: jp-vocab quiz score (final_score + time weight)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
