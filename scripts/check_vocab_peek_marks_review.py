#!/usr/bin/env python3
"""Regression: JP student peek may auto-mark when unchecked; EN must not."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

EN_LIVE = ROOT / "src/lib/en-vocab-db/live.ts"
JP_LIVE = ROOT / "src/lib/jp-vocab-db/live_rollover.ts"
JP_SHARE = ROOT / "src/lib/jp-vocab-db/share.ts"
RULE = ROOT / ".cursor/rules/vocab-peek-marks-review.mdc"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def must_contain(path: Path, needle: str, hint: str) -> None:
    if needle not in path.read_text(encoding="utf-8"):
        fail(f"{path.relative_to(ROOT)}: missing {hint} ({needle!r})")


def must_not_contain(path: Path, needle: str, hint: str) -> None:
    if needle in path.read_text(encoding="utf-8"):
        fail(f"{path.relative_to(ROOT)}: must not have {hint} ({needle!r})")


def main() -> None:
    for path in (EN_LIVE, JP_LIVE, JP_SHARE, RULE):
        if not path.is_file():
            fail(f"missing {path}")

    must_contain(EN_LIVE, "peekEnVocabTeacherQuizLiveWord", "EN peek entry")
    must_not_contain(EN_LIVE, "recordEnVocabReview", "EN peek must not auto-mark review")

    must_contain(JP_SHARE, "isJpVocabWordCheckedToday", "JP share gates auto-mark")
    must_contain(JP_SHARE, "recordJpVocabReview", "JP share records review when unchecked")

    must_contain(JP_LIVE, "peekJpVocabTeacherQuizLiveWord", "JP peek entry")
    must_contain(JP_LIVE, "isJpVocabWordCheckedToday", "JP peek gates like share")
    must_contain(JP_LIVE, 'recordJpVocabReview(db, wordId, "weak")', "JP peek auto-marks weak")
    must_contain(
        JP_LIVE,
        'await import("./review_record")',
        "JP peek dynamic-imports review_record",
    )

    must_contain(RULE, "英语", "rule documents EN vs JP")
    must_contain(RULE, "peekJpVocabTeacherQuizLiveWord", "rule points at JP peek")

    print("OK: vocab peek marks review guards passed.")


if __name__ == "__main__":
    main()
