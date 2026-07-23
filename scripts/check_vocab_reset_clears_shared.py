#!/usr/bin/env python3
"""Regression: admin reset must clear shared rows (en + jp)."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def must_contain(path: pathlib.Path, needles: list[str]) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return [n for n in needles if n not in text]


def main() -> int:
    errors: list[str] = []

    en_db = ROOT / "src/lib/en-vocab-db.ts"
    jp_db = ROOT / "src/lib/jp-vocab-db.ts"
    en_api = ROOT / "src/app/api/en-vocab/route.ts"
    jp_api = ROOT / "src/app/api/jp-vocab/route.ts"
    en_page = ROOT / "src/components/EnVocabPage.tsx"
    jp_page = ROOT / "src/components/JpVocabPage.tsx"
    rule = ROOT / ".cursor/rules/vocab-reset-clears-shared.mdc"

    for path, needles in [
        (
            en_db,
            [
                "async function clearEnVocabSharedOnReset",
                'await clearEnVocabSharedOnReset(db, "all")',
                'await clearEnVocabSharedOnReset(db, "today")',
                "DELETE FROM en_vocab_shared",
                "invalidateEnVocabSharedTodayCache()",
            ],
        ),
        (
            jp_db,
            [
                "async function clearJpVocabSharedOnReset",
                'await clearJpVocabSharedOnReset(db, "all")',
                'await clearJpVocabSharedOnReset(db, "today")',
                "DELETE FROM jp_vocab_shared",
                "invalidateJpVocabSharedTodayCache()",
            ],
        ),
        (
            en_api,
            [
                "shared_today_word_ids: [] as number[]",
            ],
        ),
        (
            jp_api,
            [
                "shared_today_word_ids: [] as number[]",
            ],
        ),
        (
            en_page,
            [
                "setSharedTodayWordIds(new Set(nextSharedIds))",
                "persistVocabCache(data.words, refs, data.display_order, nextSharedIds)",
                "并清除今日共享记录",
            ],
        ),
        (
            jp_page,
            [
                "setSharedTodayWordIds(new Set(nextSharedIds))",
                "并清除今日共享记录",
            ],
        ),
        (
            rule,
            [
                "管理员重置必须清共享",
                "clearEnVocabSharedOnReset",
                "clearJpVocabSharedOnReset",
            ],
        ),
    ]:
        if not path.is_file():
            errors.append(f"missing {path.relative_to(ROOT)}")
            continue
        missing = must_contain(path, needles)
        for n in missing:
            errors.append(f"{path.relative_to(ROOT)}: missing {n!r}")

    # resetAll / resetToday must call clear* — not only exist somewhere
    en_text = en_db.read_text(encoding="utf-8") if en_db.is_file() else ""
    if "export async function resetAllEnVocabReviews" in en_text:
        # crude: clear-all must appear after resetAll function start before next export
        start = en_text.find("export async function resetAllEnVocabReviews")
        end = en_text.find("export async function resetTodayEnVocabRound", start)
        chunk = en_text[start:end] if end > start else ""
        if 'clearEnVocabSharedOnReset(db, "all")' not in chunk:
            errors.append("resetAllEnVocabReviews must call clearEnVocabSharedOnReset(all)")
    if "export async function resetTodayEnVocabRound" in en_text:
        start = en_text.find("export async function resetTodayEnVocabRound")
        end = en_text.find("export async function uploadEnVocabWords", start)
        chunk = en_text[start:end] if end > start else ""
        if 'clearEnVocabSharedOnReset(db, "today")' not in chunk:
            errors.append("resetTodayEnVocabRound must call clearEnVocabSharedOnReset(today)")

    jp_text = jp_db.read_text(encoding="utf-8") if jp_db.is_file() else ""
    if "export async function resetAllJpVocabReviews" in jp_text:
        start = jp_text.find("export async function resetAllJpVocabReviews")
        end = jp_text.find("export async function resetTodayJpVocabRound", start)
        chunk = jp_text[start:end] if end > start else ""
        if 'clearJpVocabSharedOnReset(db, "all")' not in chunk:
            errors.append("resetAllJpVocabReviews must call clearJpVocabSharedOnReset(all)")
    if "export async function resetTodayJpVocabRound" in jp_text:
        start = jp_text.find("export async function resetTodayJpVocabRound")
        end = jp_text.find("export type UploadJpVocabWordsResult", start)
        if end < 0:
            end = jp_text.find("export async function uploadJpVocabWords", start)
        chunk = jp_text[start:end] if end > start else ""
        if 'clearJpVocabSharedOnReset(db, "today")' not in chunk:
            errors.append("resetTodayJpVocabRound must call clearJpVocabSharedOnReset(today)")

    if errors:
        print("check_vocab_reset_clears_shared FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_vocab_reset_clears_shared OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
