#!/usr/bin/env python3
"""回归：日语抽查勾选/分享/按需备注禁止整词 WORD_SELECT（含 class_notes 正文）→ 防 1102。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    helpers = (ROOT / "src/lib/jp-vocab-db/helpers.ts").read_text(encoding="utf-8")
    review = (ROOT / "src/lib/jp-vocab-db/review_record.ts").read_text(encoding="utf-8")
    share = (ROOT / "src/lib/jp-vocab-db/share.ts").read_text(encoding="utf-8")
    notes = (ROOT / "src/lib/jp-vocab-db/notes_fields.ts").read_text(encoding="utf-8")
    merge = (ROOT / "src/lib/jp-vocab-class-notes.ts").read_text(encoding="utf-8")
    actions = (
        ROOT / "src/hooks/useJpVocabReviewActions.ts"
    ).read_text(encoding="utf-8")

    if "WORD_SELECT_LIST" not in helpers:
        errors.append("helpers must define WORD_SELECT_LIST")
    # 只校验 LIST 的 SQL 字面量，勿扫后面注释里的「class_notes」字样
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

    if "WORD_SELECT_LIST" not in review or "mapReviewWordRow" not in review:
        errors.append("recordJpVocabReview must read with WORD_SELECT_LIST + mapReviewWordRow")
    if re.search(r"\$\{WORD_SELECT\} WHERE id", review):
        errors.append("review_record must not use full WORD_SELECT for single-word read")

    if "WORD_SELECT_LIST" not in share or "mapReviewWordRow" not in share:
        errors.append("share/unshare must read with WORD_SELECT_LIST + mapReviewWordRow")
    if re.search(r"\$\{WORD_SELECT\} WHERE id", share):
        errors.append("share.ts must not use full WORD_SELECT for single-word read")

    get_fn = notes.split("export async function getJpVocabClassNotes", 1)
    if len(get_fn) < 2:
        errors.append("getJpVocabClassNotes missing")
    else:
        body = get_fn[1].split("export async function updateJpVocabClassNotes", 1)[0]
        if "CLASS_NOTES_SELECT" not in notes and "mapClassNotesOnlyRow" not in notes:
            errors.append("getJpVocabClassNotes must use notes-only SELECT helper")
        if "${WORD_SELECT}" in body:
            errors.append("getJpVocabClassNotes must not prepare full WORD_SELECT")

    if "mergeJpVocabWordAfterClassNotesFetch" not in merge:
        errors.append("mergeJpVocabWordAfterClassNotesFetch missing")
    merge_fn = merge.split(
        "export function mergeJpVocabWordAfterClassNotesFetch", 1
    )[1].split("export function", 1)[0]
    if "...fetched" in merge_fn:
        errors.append(
            "mergeJpVocabWordAfterClassNotesFetch must not spread ...fetched (notes-only GET)"
        )
    if "mergeJpVocabWordAfterReviewResponse" not in merge:
        errors.append("mergeJpVocabWordAfterReviewResponse missing")
    if "mergeJpVocabWordAfterReviewResponse" not in actions:
        errors.append("useJpVocabReviewActions must merge review/share responses")

    if errors:
        print("check_jp_vocab_quiz_no_notes_blob FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_jp_vocab_quiz_no_notes_blob OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
