#!/usr/bin/env python3
"""回归：英语抽查勾选/分享/按需备注禁止整词 WORD_SELECT（含 class_notes 正文）→ 防 1102。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    helpers = (ROOT / "src/lib/en-vocab-db/helpers.ts").read_text(encoding="utf-8")
    words = (ROOT / "src/lib/en-vocab-db/words.ts").read_text(encoding="utf-8")
    usage_levels = (
        ROOT / "src/lib/en-vocab-db/review_usage_levels.ts"
    ).read_text(encoding="utf-8")
    share = (ROOT / "src/lib/en-vocab-db/share.ts").read_text(encoding="utf-8")
    notes = (ROOT / "src/lib/en-vocab-db/notes_fields.ts").read_text(encoding="utf-8")
    merge = (ROOT / "src/lib/en-vocab-teacher-quiz.ts").read_text(encoding="utf-8")
    actions = (ROOT / "src/hooks/useEnVocabReviewActions.ts").read_text(
        encoding="utf-8"
    )

    if "WORD_SELECT_LIST" not in helpers:
        errors.append("helpers must define WORD_SELECT_LIST")
    list_sql = helpers.split("export const WORD_SELECT_LIST", 1)[1].split("`;", 1)[0]
    if "has_class_notes" not in list_sql:
        errors.append("WORD_SELECT_LIST must expose has_class_notes")
    stripped = (
        list_sql.replace("has_class_notes", "").replace(
            "class_notes IS NOT NULL", ""
        )
    )
    if "class_notes" in stripped:
        errors.append("WORD_SELECT_LIST must not SELECT class_notes body")

    if "WORD_SELECT_LIST" not in words or "mapReviewWordRow" not in words:
        errors.append(
            "recordEnVocabReview* must read with WORD_SELECT_LIST + mapReviewWordRow"
        )
    # 只拦勾选路径里的整词 SELECT；addEnVocabWord 等仍可用 WORD_SELECT
    for name, src, label in (
        (
            "export async function recordEnVocabReview(",
            words,
            "words.ts recordEnVocabReview",
        ),
        (
            "export async function recordEnVocabReviewWithUsageLevels(",
            usage_levels,
            "review_usage_levels.ts",
        ),
    ):
        parts = src.split(name, 1)
        if len(parts) < 2:
            errors.append(f"missing {label}: {name}")
            continue
        body = parts[1].split("export async function ", 1)[0]
        if re.search(r"\$\{WORD_SELECT\} WHERE id", body):
            errors.append(f"{label} must not use full WORD_SELECT for single-word read")

    # usage_levels 条数校验必须另读 usage 列（LIST/mapReviewWordRow 的 usage 恒 null）
    if "SELECT usage FROM en_vocab_word WHERE id" not in usage_levels:
        errors.append(
            "recordEnVocabReviewWithUsageLevels must SELECT usage separately "
            "for expectedCount (LIST maps usage to null)"
        )
    if "listEnVocabUsagePointsForDisplay(current.usage)" in usage_levels:
        errors.append(
            "recordEnVocabReviewWithUsageLevels must not use current.usage "
            "for expectedCount (always null after mapReviewWordRow)"
        )
    if 'export * from "./review_usage_levels"' not in (
        ROOT / "src/lib/en-vocab-db/index.ts"
    ).read_text(encoding="utf-8"):
        errors.append("en-vocab-db/index.ts must re-export review_usage_levels")

    if "WORD_SELECT_LIST" not in share or "mapReviewWordRow" not in share:
        errors.append("shareEnVocabWord must read with WORD_SELECT_LIST + mapReviewWordRow")
    if re.search(r"\$\{WORD_SELECT\} WHERE id", share):
        errors.append("share.ts must not use full WORD_SELECT for single-word read")

    get_fn = notes.split("export async function getEnVocabClassNotes", 1)
    if len(get_fn) < 2:
        errors.append("getEnVocabClassNotes missing")
    else:
        body = get_fn[1].split("export async function updateEnVocabClassNotes", 1)[0]
        if "CLASS_NOTES_SELECT" not in notes and "mapClassNotesOnlyRow" not in notes:
            errors.append("getEnVocabClassNotes must use notes-only SELECT helper")
        if "${WORD_SELECT}" in body:
            errors.append("getEnVocabClassNotes must not prepare full WORD_SELECT")

    if "mergeEnVocabWordAfterClassNotesFetch" not in merge:
        errors.append("mergeEnVocabWordAfterClassNotesFetch missing")
    merge_fn = merge.split(
        "export function mergeEnVocabWordAfterClassNotesFetch", 1
    )[1].split("export function", 1)[0]
    if "...fetched" in merge_fn:
        errors.append(
            "mergeEnVocabWordAfterClassNotesFetch must not spread ...fetched (notes-only GET)"
        )
    if "mergeEnVocabWordAfterReviewResponse" not in merge:
        errors.append("mergeEnVocabWordAfterReviewResponse missing")
    if "mergeEnVocabWordAfterReviewResponse" not in actions:
        errors.append("useEnVocabReviewActions must merge review/share responses")
    if re.search(
        r"w\.id === data\.word(?:!)?\.id \? data\.word",
        actions,
    ):
        errors.append(
            "useEnVocabReviewActions must not whole-replace list row with data.word"
        )

    # 冷 isolate 禁止每次 ensure schema 都全表 TRIM UPDATE
    ensure = helpers.split("export async function ensureVocabWordSchema", 1)
    if len(ensure) < 2:
        errors.append("ensureVocabWordSchema missing")
    else:
        body = ensure[1].split("export async function ensureEnVocabWordSchema", 1)[0]
        if "hadCategory" not in body or "hadUploadSource" not in body:
            errors.append(
                "ensureVocabWordSchema must gate TRIM backfill on newly-added columns"
            )

    if errors:
        print("check_en_vocab_quiz_no_notes_blob FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_en_vocab_quiz_no_notes_blob OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
