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
            "export function areEnVocabUsageLevelsComplete",
            'if (a === "normal" && b === "normal") return "weak"',
        ]:
            if n not in review.read_text(encoding="utf-8"):
                errors.append(f"en-vocab-review.ts: missing {n!r}")

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
        "findFirstIncompleteEnVocabUsageLevelIndex",
        "focusUsageLevelAt",
        "data-en-usage-level-index",
        "usagesCompleteForShare",
    ]:
        if n not in flash_text:
            errors.append(f"EnVocabTeacherQuizFlashcardModal.tsx: missing {n!r}")

    paired = ROOT / "src/components/EnVocabUsageExamplesPairedContent.tsx"
    paired_text = paired.read_text(encoding="utf-8") if paired.is_file() else ""
    if not paired.is_file():
        errors.append(f"missing {paired.relative_to(ROOT)}")
    else:
        for n in [
            "en-usage-ex-paired-levels",
            "border: 1.5px solid var(--rise)",
            "data-en-usage-level-index",
            "focusIndex",
            "en-usage-ex-paired-levels--focus",
        ]:
            if n not in paired_text:
                errors.append(
                    f"EnVocabUsageExamplesPairedContent.tsx: missing {n!r}"
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

    if errors:
        print("FAIL: en-vocab usage-level aggregate guards")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("OK: en-vocab usage-level aggregate + wiring")
    return 0


if __name__ == "__main__":
    sys.exit(main())
