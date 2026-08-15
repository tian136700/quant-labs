#!/usr/bin/env python3
"""Regression: EN teacher quiz phone + landscape (most handsets)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STYLES = ROOT / "src/components/JpVocabTeacherQuizFlashcardStyles.tsx"
START = ROOT / "src/components/en-vocab-page/EnVocabTeacherQuizStartPanel.tsx"
INTRO = ROOT / "src/components/EnVocabTeacherQuizIntroModal.tsx"
COMPLETE = ROOT / "src/components/EnVocabDailyQuizCompleteModal.tsx"
LAYOUT = ROOT / "src/app/layout.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    for path in (STYLES, START, INTRO, COMPLETE, LAYOUT):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    styles = STYLES.read_text(encoding="utf-8")
    start = START.read_text(encoding="utf-8")
    intro = INTRO.read_text(encoding="utf-8")
    complete = COMPLETE.read_text(encoding="utf-8")
    layout = LAYOUT.read_text(encoding="utf-8")

    if "viewportFit" not in layout and "viewport-fit" not in layout:
        fail("root layout must set viewportFit/cover so iPhone safe-area insets work")

    if "(max-height: 540px) and (orientation: landscape)" not in styles:
        fail(
            "EN flashcard mobile query must include landscape phones "
            "(max-height: 540px) and (orientation: landscape) — "
            "iPhone 14 landscape is ~844×390 and would otherwise get desktop two-col"
        )
    if "safe-area-inset-top" not in styles:
        fail("EN flashcard must pad safe-area-inset-top")
    if "safe-area-inset-bottom" not in styles:
        fail("EN flashcard must pad safe-area-inset-bottom")
    if "100svh" not in styles:
        fail("EN flashcard overlay must use 100svh (Chrome address bar)")
    if "nav-btn.btn-rsi-filter" not in styles or "width: auto" not in styles:
        fail(
            "EN flashcard nav buttons must override mobile-base width:100% "
            "(keep 上一个/下一个 on one row)"
        )
    if "flex-wrap: nowrap" not in styles:
        fail("EN flashcard nav must flex-wrap: nowrap on phones")
    speak_idx = styles.find(".en-vocab-flashcard-speak-row {")
    if speak_idx < 0:
        fail("styles must mention en-vocab-flashcard-speak-row")
    # phone block restyles speak-row to column
    if "flex-direction: column" not in styles[speak_idx:]:
        fail("phone EN flashcard speak-row must stack 播放录音 + 发送读音")
    if "white-space: normal" not in styles:
        fail("phone EN flashcard must allow speak/IPA/level labels to wrap")

    if "order: -1" not in start and "order:-1" not in start:
        fail("start panel phone must put 开始抽查 above the pending list")
    if "@media (max-width: 767px)" not in start:
        fail("start panel must stack at max-width: 767px")
    if "min-height: 3rem" not in start:
        fail("start panel 开始抽查 must be ≥3rem on phones")

    if "@media (max-width: 767px)" not in intro:
        fail("intro modal sheet must use max-width: 767px (not only 480)")
    if "safe-area-inset-bottom" not in intro:
        fail("intro modal must pad home-indicator safe-area")
    if "2.75rem" not in intro:
        fail("intro close / confirm must meet 2.75rem touch target on phones")
    if "overflow-y: auto" not in intro:
        fail("intro body must scroll so 开始抽查 stays visible")

    if "flex-direction: column" not in complete:
        fail("complete modal must be able to stack action buttons on narrow phones")
    if "safe-area-inset-bottom" not in complete:
        fail("complete modal must pad home-indicator safe-area")

    print(
        "OK: en-vocab teacher quiz phone/landscape: fullscreen+safe-area, "
        "CTA first, nav one row, speak stacked"
    )


if __name__ == "__main__":
    main()
