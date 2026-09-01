#!/usr/bin/env python3
"""Regression: en-vocab per-review audit log removed (勾选记录)."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    p = ROOT / path
    return p.read_text(encoding="utf-8") if p.is_file() else ""


def main() -> int:
    errors: list[str] = []

    forbidden = [
        ("src/lib/en-vocab-db/words.ts", ["appendEnVocabReviewLog", "writeReviewLog"]),
        ("src/lib/en-vocab-db/index.ts", ["review-log"]),
        (
            "src/components/en-vocab-page/EnVocabWordTable.tsx",
            ["勾选记录", "onViewReviewLog"],
        ),
        ("src/components/EnVocabPage.tsx", ["viewingReviewLogWord", "onViewReviewLog"]),
        (
            "src/components/en-vocab-page/EnVocabPageModals.tsx",
            ["EnVocabReviewLogModal", "viewingReviewLogWord"],
        ),
    ]
    for path, needles in forbidden:
        text = read(path)
        if not text:
            errors.append(f"missing file: {path}")
            continue
        for needle in needles:
            if needle in text:
                errors.append(f"{path}: must not contain {needle!r}")

    removed_paths = [
        "src/lib/en-vocab-db/review-log.ts",
        "src/lib/en-vocab-review-log.ts",
        "src/components/EnVocabReviewLogModal.tsx",
        "src/app/api/en-vocab/review-log/route.ts",
        "docs/en-vocab-review-log-api.txt",
    ]
    for path in removed_paths:
        if (ROOT / path).is_file():
            errors.append(f"should be removed: {path}")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1

    print("OK: en-vocab review audit log removed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
