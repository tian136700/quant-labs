#!/usr/bin/env python3
"""Regression: student peek into shared must record familiarity when unchecked.

Otherwise admin shows 「从未抽查」 while the word is already on today's study list.
Aligns peek with share*Word auto-mark weak.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

EN_LIVE = ROOT / "src/lib/en-vocab-db/live.ts"
JP_LIVE = ROOT / "src/lib/jp-vocab-db/live_rollover.ts"
EN_SHARE = ROOT / "src/lib/en-vocab-db/share.ts"
JP_SHARE = ROOT / "src/lib/jp-vocab-db/share.ts"
RULE = ROOT / ".cursor/rules/vocab-peek-marks-review.mdc"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def must_contain(path: Path, needle: str, hint: str) -> None:
    if needle not in path.read_text(encoding="utf-8"):
        fail(f"{path.relative_to(ROOT)}: missing {hint} ({needle!r})")


def main() -> None:
    for path in (EN_LIVE, JP_LIVE, EN_SHARE, JP_SHARE, RULE):
        if not path.is_file():
            fail(f"missing {path}")

    must_contain(EN_SHARE, "isEnVocabWordCheckedToday", "EN share gates auto-mark")
    must_contain(EN_SHARE, 'recordEnVocabReview(db, wordId, "weak")', "EN share auto-marks weak")
    must_contain(JP_SHARE, "isJpVocabWordCheckedToday", "JP share gates auto-mark")
    must_contain(JP_SHARE, "recordJpVocabReview", "JP share records review when unchecked")

    must_contain(EN_LIVE, "peekEnVocabTeacherQuizLiveWord", "EN peek entry")
    must_contain(EN_LIVE, "isEnVocabWordCheckedToday", "EN peek gates like share")
    must_contain(EN_LIVE, 'recordEnVocabReview(db, wordId, "weak")', "EN peek auto-marks weak")
    must_contain(
        EN_LIVE,
        'await import("./words")',
        "EN peek dynamic-imports words to avoid live↔words cycle",
    )

    must_contain(JP_LIVE, "peekJpVocabTeacherQuizLiveWord", "JP peek entry")
    must_contain(JP_LIVE, "isJpVocabWordCheckedToday", "JP peek gates like share")
    must_contain(JP_LIVE, 'recordJpVocabReview(db, wordId, "weak")', "JP peek auto-marks weak")
    must_contain(
        JP_LIVE,
        'await import("./review_record")',
        "JP peek dynamic-imports review_record",
    )

    must_contain(RULE, "从未抽查", "rule names the admin symptom")
    must_contain(RULE, "peekEnVocabTeacherQuizLiveWord", "rule points at EN peek")
    must_contain(RULE, "peekJpVocabTeacherQuizLiveWord", "rule points at JP peek")

    print("OK: vocab peek marks review guards passed.")


if __name__ == "__main__":
    main()
