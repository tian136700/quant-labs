#!/usr/bin/env python3
"""Regression: en-vocab per-review history log (勾选记录)."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    p = ROOT / path
    return p.read_text(encoding="utf-8") if p.is_file() else ""


def main() -> int:
    errors: list[str] = []

    for path, needles in [
        (
            "src/lib/en-vocab-db/review-log.ts",
            [
                "en_vocab_review_log",
                "appendEnVocabReviewLog",
                "listEnVocabReviewLog",
            ],
        ),
        (
            "src/lib/en-vocab-db/words.ts",
            [
                "appendEnVocabReviewLog",
                "writeReviewLog",
                "reviewSource",
            ],
        ),
        (
            "src/app/api/en-vocab/review-log/route.ts",
            ["listEnVocabReviewLog", "requireEnVocabRead"],
        ),
        (
            "src/components/EnVocabReviewLogModal.tsx",
            ["/api/en-vocab/review-log", "勾选记录"],
        ),
        (
            "src/components/en-vocab-page/EnVocabWordTable.tsx",
            ["勾选记录", "onViewReviewLog"],
        ),
        (
            "src/components/en-vocab-page/EnVocabPageWordList.tsx",
            ["onViewReviewLog"],
        ),
        (
            "src/components/en-vocab-page/EnVocabPageModals.tsx",
            ["EnVocabReviewLogModal", "viewingReviewLogWord"],
        ),
        (
            "src/components/EnVocabPage.tsx",
            ["viewingReviewLogWord", "onViewReviewLog"],
        ),
        (
            "src/lib/en-vocab-db/share.ts",
            [
                "shareEnVocabWord",
            ],
        ),
        (
            "src/lib/en-vocab-db/live.ts",
            ['reviewSource: "peek_weak"'],
        ),
    ]:
        text = read(path)
        if not text:
            errors.append(f"missing file: {path}")
            continue
        for needle in needles:
            if needle not in text:
                errors.append(f"{path}: missing {needle!r}")

    if not (ROOT / "docs/en-vocab-review-log-api.txt").is_file():
        errors.append("missing docs/en-vocab-review-log-api.txt")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1

    print("OK: en-vocab review log wiring")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
