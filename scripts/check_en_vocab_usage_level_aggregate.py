#!/usr/bin/env python3
"""Regression: en-vocab per-usage familiarity aggregate + wiring guards."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

RANK = {"weak": 0, "normal": 1, "very": 2}
RANK_TO = ("weak", "normal", "very")


def combine(a: str, b: str) -> str:
    if a == "normal" and b == "normal":
        return "weak"
    if (a == "very" and b == "weak") or (a == "weak" and b == "very"):
        return "normal"
    return RANK_TO[min(RANK[a], RANK[b])]


def aggregate(levels: list[str]) -> str:
    if not levels:
        raise ValueError("empty")
    acc = levels[0]
    for cur in levels[1:]:
        acc = combine(acc, cur)
    return acc


def must_contain(path: pathlib.Path, needles: list[str]) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return [n for n in needles if n not in text]


def main() -> int:
    errors: list[str] = []

    # Truth table (must match src/lib/en-vocab-review.ts)
    cases = [
        (("very", "very"), "very"),
        (("very", "normal"), "normal"),
        (("very", "weak"), "normal"),
        (("normal", "normal"), "weak"),
        (("normal", "weak"), "weak"),
        (("weak", "weak"), "weak"),
        (("normal", "very"), "normal"),
        (("weak", "very"), "normal"),
        (("weak", "normal"), "weak"),
        (("very",), "very"),
        (("very", "normal", "weak"), "weak"),  # very+normal=normal; normal+weak=weak
        (("very", "very", "very"), "very"),
        (("normal", "normal", "normal"), "weak"),
    ]
    for levels, expected in cases:
        got = aggregate(list(levels))
        if got != expected:
            errors.append(f"aggregate{levels!r} -> {got!r}, expected {expected!r}")

    review = ROOT / "src/lib/en-vocab-review.ts"
    if not review.is_file():
        errors.append(f"missing {review.relative_to(ROOT)}")
    else:
        for n in [
            "export function combineEnVocabUsageLevels",
            "export function aggregateEnVocabUsageLevels",
            "export function parseEnVocabLastUsageLevels",
            "export function findFirstIncompleteEnVocabUsageLevelIndex",
            "export function listIncompleteEnVocabUsageLevelIndices",
            "export function formatEnVocabUncheckedUsagesHint",
            "export function areEnVocabUsageLevelsComplete",
            "export function resolveEnVocabUsageDraftLevels",
            'if (a === "normal" && b === "normal") return "weak"',
        ]:
            if n not in review.read_text(encoding="utf-8"):
                errors.append(f"en-vocab-review.ts: missing {n!r}")

    # resolveEnVocabUsageDraftLevels：草稿优先，其次存库；不依赖 selected
    review_src = review.read_text(encoding="utf-8")
    if "sessionDraft && sessionDraft.length === usageSlotCount" not in review_src:
        errors.append(
            "en-vocab-review.ts: resolveEnVocabUsageDraftLevels must prefer session draft"
        )
    if "parseEnVocabLastUsageLevels(storedRaw)" not in review_src:
        errors.append(
            "en-vocab-review.ts: resolveEnVocabUsageDraftLevels must fall back to last_usage_levels"
        )
    db = ROOT / "src/lib/en-vocab-db.ts"
    for n in [
        "last_usage_levels",
        'addEnVocabWordColumnIfMissing(db, cols, "last_usage_levels"',
        "recordEnVocabReviewWithUsageLevels",
    ]:
        if n not in db.read_text(encoding="utf-8"):
            errors.append(f"en-vocab-db.ts: missing {n!r}")

    route = ROOT / "src/app/api/en-vocab/route.ts"
    for n in ["usage_levels", "recordEnVocabReviewWithUsageLevels"]:
        if n not in route.read_text(encoding="utf-8"):
            errors.append(f"en-vocab/route.ts: missing {n!r}")

    flash = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"
    flash_text = flash.read_text(encoding="utf-8") if flash.is_file() else ""
    for n in [
        "onSelectUsageLevels",
        "usageLevelControls",
        "aggregateEnVocabUsageLevels",
        "listIncompleteEnVocabUsageLevelIndices",
        "formatEnVocabUncheckedUsagesHint",
        "showUncheckedUsagesBlocked",
        "usagesCompleteForShare",
        "resolveEnVocabUsageDraftLevels",
        "勾选已满 1 小时，无法再修改熟悉程度",
    ]:
        if n not in flash_text:
            errors.append(f"EnVocabTeacherQuizFlashcardModal.tsx: missing {n!r}")

    if "今日已共享，熟悉程度不可更改" in flash_text:
        errors.append(
            "EnVocabTeacherQuizFlashcardModal.tsx: must not say share locks levels"
        )
    # 禁止再加「滚动定位未勾用法」（暗色主题提示条曾看不清）
    for banned in [
        "focusUsageLevelAt",
        "scrollIntoView",
        "focusUncheckedUsageIndex",
        "en-vocab-flashcard-usage-focus-hint",
        "focusIndex",
    ]:
        if banned in flash_text:
            errors.append(
                f"EnVocabTeacherQuizFlashcardModal.tsx: must not use locate/scroll {banned!r}"
            )

    review = ROOT / "src/lib/en-vocab-review.ts"
    review_text = review.read_text(encoding="utf-8") if review.is_file() else ""
    for n in [
        "listIncompleteEnVocabUsageLevelIndices",
        "formatEnVocabUncheckedUsagesHint",
        "findFirstIncompleteEnVocabUsageLevelIndex",
        "areEnVocabUsageLevelsComplete",
    ]:
        if f"export function {n}" not in review_text:
            errors.append(f"en-vocab-review.ts: missing export {n!r}")
    if "此单词的" not in review_text or "还未勾选" not in review_text:
        errors.append(
            "en-vocab-review.ts: formatEnVocabUncheckedUsagesHint must list unchecked usages"
        )

    paired = ROOT / "src/components/EnVocabUsageExamplesPairedContent.tsx"
    paired_text = paired.read_text(encoding="utf-8") if paired.is_file() else ""
    if not paired.is_file():
        errors.append(f"missing {paired.relative_to(ROOT)}")
    else:
        for n in [
            "en-usage-ex-paired-levels",
            "border: 1.5px solid var(--rise)",
            "data-en-usage-level-index",
            "disabledReason",
        ]:
            if n not in paired_text:
                errors.append(
                    f"EnVocabUsageExamplesPairedContent.tsx: missing {n!r}"
                )
        for banned in ["focusIndex", "en-usage-ex-paired-levels--focus"]:
            if banned in paired_text:
                errors.append(
                    f"EnVocabUsageExamplesPairedContent.tsx: must not use locate {banned!r}"
                )

    page = ROOT / "src/components/EnVocabPage.tsx"
    page_text = page.read_text(encoding="utf-8") if page.is_file() else ""
    for n in [
        "recordUsageLevels",
        "quizCardPreviewWordId",
        "查看抽问卡片",
        "previewMode",
        "areEnVocabUsageLevelsComplete",
        "请先在抽查卡为每条用法勾选熟悉程度",
    ]:
        if n not in page_text:
            errors.append(f"EnVocabPage.tsx: missing {n!r}")

    # Incomplete draft must not POST
    if "if (!levels.length || levels.some((lv) => lv == null))" not in page_text:
        errors.append(
            "EnVocabPage.tsx: recordUsageLevels must return early when levels incomplete"
        )

    # 草稿须在 canOperate 校验之前写入，避免点了无勾选态
    draft_idx = page_text.find(
        "setSessionUsageLevels((prev) => ({ ...prev, [wordId]: levels }))"
    )
    auth_idx = page_text.find(
        'setStatus("请登录后再勾选熟悉程度。")',
        page_text.find("const recordUsageLevels"),
    )
    if draft_idx < 0 or auth_idx < 0 or draft_idx > auth_idx:
        errors.append(
            "EnVocabPage.tsx: recordUsageLevels must setSessionUsageLevels before canOperate early-return"
        )
    # 写库失败不得把 sessionUsageLevels 打回未齐 / delete（第二条勾选会消失）
    if "if (prevUsage) next[wordId] = prevUsage" in page_text:
        errors.append(
            "EnVocabPage.tsx: must not roll back sessionUsageLevels to prevUsage on save failure"
        )
    if "usageLevelSavingRef" not in page_text:
        errors.append(
            "EnVocabPage.tsx: missing usageLevelSavingRef concurrent-save guard"
        )
    if "setSessionUsageLevels((prev) => ({ ...prev, [wordId]: complete }))" not in page_text:
        errors.append(
            "EnVocabPage.tsx: on usage-level save failure must keep complete draft"
        )

    # 草稿已齐但 selected 空时，「下一个」应重试写库而非误报未勾选
    if "areEnVocabUsageLevelsComplete(usageDraftLevels, usageSlotCount)" not in flash_text:
        errors.append(
            "EnVocabTeacherQuizFlashcardModal.tsx: tryGoNext must retry when draft complete"
        )
    if "onSelectUsageLevels(w.id, usageDraftLevels)" not in flash_text:
        errors.append(
            "EnVocabTeacherQuizFlashcardModal.tsx: tryGoNext must call onSelectUsageLevels to retry"
        )

    db_text = db.read_text(encoding="utf-8") if db.is_file() else ""
    if "EN_VOCAB_WORD_SCHEMA_VERSION" not in db_text:
        errors.append(
            "en-vocab-db.ts: missing EN_VOCAB_WORD_SCHEMA_VERSION (schema ready bump)"
        )

    schema = ROOT / "schema.sql"
    if schema.is_file() and "last_usage_levels" not in schema.read_text(encoding="utf-8"):
        errors.append("schema.sql: en_vocab_word must declare last_usage_levels")

    if errors:
        print("FAIL: en-vocab usage-level aggregate guards")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("OK: en-vocab usage-level aggregate + wiring")
    return 0


if __name__ == "__main__":
    sys.exit(main())
