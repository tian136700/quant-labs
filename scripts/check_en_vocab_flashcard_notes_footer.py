#!/usr/bin/env python3
"""Regression: EN flashcard notes above level/stats; whole-card scroll (footer not pinned)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODAL = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"
MODAL_DIR = ROOT / "src/components/en-vocab-teacher-quiz-flashcard"
STYLES = ROOT / "src/components/JpVocabTeacherQuizFlashcardStyles.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def read_modal_bundle() -> str:
    parts = [MODAL.read_text(encoding="utf-8")]
    if MODAL_DIR.is_dir():
        for f in sorted(MODAL_DIR.glob("*.tsx")) + sorted(MODAL_DIR.glob("*.ts")):
            parts.append(f.read_text(encoding="utf-8"))
    return "\n".join(parts)


def first_rule_block(styles: str, selector: str) -> str:
    idx = styles.find(selector)
    if idx < 0:
        fail(f"styles must define {selector.strip()}")
    # take until matching closing brace of the rule (first top-level })
    brace = styles.find("{", idx)
    if brace < 0:
        fail(f"styles: no '{{' after {selector.strip()}")
    depth = 0
    for i in range(brace, len(styles)):
        ch = styles[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return styles[idx : i + 1]
    fail(f"styles: unclosed block for {selector.strip()}")
    return ""


def main() -> None:
    if not MODAL.is_file():
        fail(f"missing {MODAL.relative_to(ROOT)}")
    if not STYLES.is_file():
        fail(f"missing {STYLES.relative_to(ROOT)}")

    modal = read_modal_bundle()
    styles = STYLES.read_text(encoding="utf-8")

    if "en-vocab-flashcard-page-footer__notes" not in modal:
        fail("modal must use en-vocab-flashcard-page-footer__notes")
    if "en-vocab-flashcard-page-footer__panels" not in modal:
        fail("modal must wrap level/stats in en-vocab-flashcard-page-footer__panels")

    # Notes must appear before panels inside footer (not below the two boxes)
    notes_pos = modal.find("en-vocab-flashcard-page-footer__notes")
    panels_pos = modal.find("en-vocab-flashcard-page-footer__panels")
    if notes_pos < 0 or panels_pos < 0 or notes_pos > panels_pos:
        fail("footer notes must appear before footer__panels (above level/stats)")

    # Side column must not host the notes section
    side_idx = modal.find('className="en-vocab-flashcard-page__col-side"')
    footer_idx = modal.find('className="en-vocab-flashcard-page-footer"')
    notes_class_idx = modal.find("en-vocab-flashcard-page-footer__notes")
    if footer_idx < 0 or notes_class_idx < 0:
        fail("footer / footer__notes markers missing")
    if notes_class_idx < footer_idx:
        fail("footer__notes must be inside en-vocab-flashcard-page-footer")
    if side_idx >= 0:
        between = modal[side_idx:footer_idx]
        if "jp-vocab-teacher-quiz__notes" in between:
            fail("notes must not live inside en-vocab-flashcard-page__col-side")

    if "en-vocab-flashcard-page-footer__panels" not in styles:
        fail("styles must define .en-vocab-flashcard-page-footer__panels")
    if "en-vocab-flashcard-page-footer__notes" not in styles:
        fail("styles must define .en-vocab-flashcard-page-footer__notes")

    # Whole-card scroll: do not pin footer by only scrolling the middle body
    card_block = first_rule_block(
        styles, ".jp-vocab-teacher-quiz-card.en-vocab-flashcard-page {"
    )
    if "height: auto" not in card_block:
        fail("en-vocab-flashcard-page card must use height: auto (whole-card scroll)")
    if "overflow-y: auto" not in card_block:
        fail("en-vocab-flashcard-page card must use overflow-y: auto (whole-card scroll)")
    # First declaration block should not pin with overflow:hidden alone
    if "overflow: hidden" in card_block and "overflow-y: auto" not in card_block:
        fail(
            "en-vocab-flashcard-page card must not use overflow: hidden "
            "(that pins footer; use whole-card overflow-y: auto)"
        )

    body_block = first_rule_block(
        styles, ".en-vocab-flashcard-page .en-vocab-flashcard-page__body"
    )
    if "overflow-y: auto" in body_block:
        fail(
            "en-vocab-flashcard-page__body must NOT be the sole scroller "
            "(use overflow: visible; whole card scrolls)"
        )
    if "overflow: visible" not in body_block:
        fail("en-vocab-flashcard-page__body must use overflow: visible")
    if "flex: 1 1 auto" in body_block:
        fail(
            "en-vocab-flashcard-page__body must not flex-grow as middle scroller "
            "(use flex: 0 0 auto)"
        )

    # Overlay: flex-start so tall cards remain scrollable to 「下一个」
    overlay_block = first_rule_block(styles, ".en-vocab-flashcard-page-overlay {")
    if "align-items: center" in overlay_block:
        fail(
            "en-vocab-flashcard-page-overlay must not use align-items: center "
            "(use flex-start so 「下一个」 stays reachable)"
        )
    if "align-items: flex-start" not in overlay_block:
        fail("en-vocab-flashcard-page-overlay must use align-items: flex-start")

    # Panels: natural height, not equal-height stretched cells
    if "height: 100%" in styles[
        styles.find(".en-vocab-flashcard-page-footer__panels") : styles.find(
            ".en-vocab-flashcard-page-footer__panels"
        )
        + 800
    ]:
        # only fail if level/stats forced to 100% under panels
        panels_region = styles[
            styles.find(".en-vocab-flashcard-page-footer__panels") : styles.find(
                ".en-vocab-flashcard-page-footer__panels"
            )
            + 1200
        ]
        if (
            "jp-vocab-teacher-quiz__level" in panels_region
            and "height: 100%" in panels_region
        ):
            fail(
                "footer panels must not force level/stats height: 100% "
                "(no fixed equal-height cells)"
            )

    print(
        "OK: en-vocab flashcard notes above panels; "
        "whole-card scroll (footer not pinned)"
    )


if __name__ == "__main__":
    main()
