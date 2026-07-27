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
DB_DIR = ROOT / "src/lib/jp-vocab-db"
ROUTE = ROOT / "src/app/api/jp-vocab/route.ts"
PAGE = ROOT / "src/components/JpVocabPage.tsx"
ADMIN_ACTIONS = ROOT / "src/hooks/useJpVocabAdminActions.ts"
ADMIN_UI = ROOT / "src/components/JpVocabQuizTimeWeightAdmin.tsx"
HEADER = ROOT / "src/components/jp-vocab-page/JpVocabPageHeader.tsx"
EXCEL = ROOT / "src/lib/jp-vocab-excel-export.ts"
RISK = ROOT / "src/lib/jp-vocab-risk.ts"
CACHE = ROOT / "src/lib/jp-vocab-page-cache.ts"
TABLE = ROOT / "src/components/jp-vocab-page/JpVocabWordTable.tsx"
RULE = ROOT / ".cursor/rules/jp-vocab-quiz-time-weight.mdc"

errors: list[str] = []


def read_jp_vocab_db() -> str:
    parts = [DB.read_text(encoding="utf-8")]
    if DB_DIR.is_dir():
        for p in sorted(DB_DIR.glob("*.ts")):
            parts.append(p.read_text(encoding="utf-8"))
    return "\n".join(parts)


def must_contain(path: Path, needle: str, msg: str) -> None:
    text = path.read_text(encoding="utf-8") if path != DB else read_jp_vocab_db()
    if needle not in text:
        label = "src/lib/jp-vocab-db/" if path == DB else path.relative_to(ROOT)
        errors.append(f"{label}: {msg}（缺「{needle[:60]}」）")


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

    must_contain(SCORE, "jpVocabAppliesFinalQuizScore", "须有从未抽查不算分判断")
    must_contain(SCORE, "jpVocabFinalQuizScoreOrNull", "须有 OrNull（从未抽查→null）")
    must_match(
        SHARED,
        r"从未抽查桶内|aFront \|\| bFront \|\| aDefer",
        "日序从未抽查桶内禁止再用 final_score",
    )
    # 日序函数体内：front 桶之后才 FinalQuizScore；且不得在 front 相等时直接 RiskIndex
    m = re.search(
        r"export function sortJpVocabWordsForDailyOrder\([\s\S]*?\n\}",
        SHARED.read_text(encoding="utf-8"),
    )
    if not m:
        errors.append("jp-vocab-shared.ts: 找不到 sortJpVocabWordsForDailyOrder")
    else:
        body = m.group(0)
        if "jpVocabFinalQuizScore" not in body:
            errors.append("日序须对已抽查词用 jpVocabFinalQuizScore")
        if "EligibleNeverQuizzedForFront" not in body:
            errors.append("日序须先从未抽查置顶")
        # 桶内应有 localeCompare 早退，避免 front 词互相比分
        if "localeCompare" not in body:
            errors.append("从未抽查桶内须稳定排序（localeCompare）")

    must_contain(TABLE, "jpVocabFinalQuizScoreOrNull", "表格须用 OrNull，从未抽查显示 —")
    must_contain(RISK, "jpVocabAppliesFinalQuizScore", "排行须排除从未抽查")
    must_contain(EXCEL, "从未抽查", "Excel 规则须写明从未抽查不算分")
    must_contain(RULE, "不算 priority", "规则须禁止给从未抽查算分")

    must_contain(DB, "getJpVocabQuizTimeWeight", "DB 须可读时间权重（固定默认）")
    must_contain(SCORE, 'JP_VOCAB_QUIZ_TIME_WEIGHT_KEY = "quiz_time_weight"', "setting key 常量保留")
    must_contain(SCORE, "JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT = 0.1", "默认权重 0.1")

    must_contain(ROUTE, "quiz_time_weight", "GET 须返回 quiz_time_weight")
    route_text = ROUTE.read_text(encoding="utf-8")
    if "set_quiz_time_weight" in route_text:
        errors.append(f"{ROUTE.relative_to(ROOT)}: 禁止再提供 set_quiz_time_weight（权重已固定）")
    if "setJpVocabQuizTimeWeight" in read_jp_vocab_db():
        errors.append("src/lib/jp-vocab-db/: 禁止再导出 setJpVocabQuizTimeWeight")

    if ADMIN_UI.exists():
        errors.append(
            f"{ADMIN_UI.relative_to(ROOT)}: 管理员权重 UI 已删除，勿再恢复"
        )
    page_ui = PAGE.read_text(encoding="utf-8") + "\n" + HEADER.read_text(encoding="utf-8")
    admin_actions = ADMIN_ACTIONS.read_text(encoding="utf-8")
    if "JpVocabQuizTimeWeightAdmin" in page_ui:
        errors.append(
            f"{HEADER.relative_to(ROOT)}: 禁止再挂 JpVocabQuizTimeWeightAdmin"
        )
    if "set_quiz_time_weight" in page_ui + admin_actions:
        errors.append(
            f"{PAGE.relative_to(ROOT)} / {ADMIN_ACTIONS.relative_to(ROOT)}: "
            "禁止再 POST 保存权重"
        )
    must_contain(PAGE, "quizTimeWeight={quizTimeWeight}", "表格/卡片须传入权重")
    must_contain(RULE, "set_quiz_time_weight", "规则须禁止再开放调节")
    must_contain(RULE, "JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT", "规则须写明固定默认权重")

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
