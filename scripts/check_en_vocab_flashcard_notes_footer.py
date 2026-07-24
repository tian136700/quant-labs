#!/usr/bin/env python3
"""Regression: EN flashcard notes sit above level/stats panels, not in side col / below."""

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

    # Side column must not host the notes section: notes marker only after footer opens
    side_idx = modal.find('className="en-vocab-flashcard-page__col-side"')
    footer_idx = modal.find('className="en-vocab-flashcard-page-footer"')
    notes_class_idx = modal.find("en-vocab-flashcard-page-footer__notes")
    if footer_idx < 0 or notes_class_idx < 0:
        fail("footer / footer__notes markers missing")
    if notes_class_idx < footer_idx:
        fail("footer__notes must be inside en-vocab-flashcard-page-footer")
    if side_idx >= 0:
        # Any jp-vocab-teacher-quiz__notes between side col open and footer open is wrong
        between = modal[side_idx:footer_idx]
        if "jp-vocab-teacher-quiz__notes" in between:
            fail("notes must not live inside en-vocab-flashcard-page__col-side")

    if "en-vocab-flashcard-page-footer__panels" not in styles:
        fail("styles must define .en-vocab-flashcard-page-footer__panels")
    if "en-vocab-flashcard-page-footer__notes" not in styles:
        fail("styles must define .en-vocab-flashcard-page-footer__notes")

    # Pin chrome + scroll middle: 「下一个」必须始终在视口内（整卡滚动曾把导航顶出屏幕）
    card_block_start = styles.find(
        ".jp-vocab-teacher-quiz-card.en-vocab-flashcard-page {"
    )
    if card_block_start < 0:
        fail("styles must define .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page")
    card_block = styles[card_block_start : card_block_start + 900]
    if "overflow: hidden" not in card_block:
        fail(
            "en-vocab-flashcard-page card must use overflow: hidden "
            "(pin header/footer/nav; do not whole-card scroll)"
        )
    if "overflow-y: auto" in card_block.split("}")[0]:
        fail(
            "en-vocab-flashcard-page card must NOT use overflow-y: auto "
            "(that buries 「下一个」 below the fold)"
        )
    if "height: auto" in card_block.split("}")[0]:
        fail(
            "en-vocab-flashcard-page card must use a bounded height "
            "(min(96vh)/min(94vh)/100dvh), not height: auto"
        )

    body_block_start = styles.find(
        ".en-vocab-flashcard-page .en-vocab-flashcard-page__body"
    )
    if body_block_start < 0:
        fail("styles must define .en-vocab-flashcard-page__body")
    body_block = styles[body_block_start : body_block_start + 600]
    if "overflow-y: auto" not in body_block:
        fail("en-vocab-flashcard-page__body must use overflow-y: auto (middle scroller)")
    if "flex: 1 1 auto" not in body_block:
        fail("en-vocab-flashcard-page__body must flex-grow as the middle scroller")
    if "min-height: 0" not in body_block:
        fail("en-vocab-flashcard-page__body must set min-height: 0 for flex overflow")

    # Desktop override must keep middle scroll (not revert to whole-card)
    desktop_marker = (
        ".jp-vocab-teacher-quiz-card.en-vocab-flashcard-page\n"
        "            .jp-vocab-teacher-quiz__scroll-body"
    )
    desktop_alt = (
        ".jp-vocab-teacher-quiz-card.en-vocab-flashcard-page\n"
        "          .jp-vocab-teacher-quiz__scroll-body"
    )
    desk_idx = styles.find(desktop_marker)
    if desk_idx < 0:
        desk_idx = styles.find(desktop_alt)
    if desk_idx < 0:
        # looser: any scroll-body rule after en-vocab-flashcard-page-overlay desktop
        desk_idx = styles.find(
            ".jp-vocab-teacher-quiz-card.en-vocab-flashcard-page"
            "\n            .jp-vocab-teacher-quiz__scroll-body {"
        )
    if desk_idx < 0:
        # find within min-width 1025 block related to en flashcard
        probe = styles.find("@media (min-width: 1025px)")
        en_desk = styles.find(
            ".jp-vocab-teacher-quiz-card.en-vocab-flashcard-page {", probe
        )
        if en_desk < 0:
            fail("desktop en-vocab-flashcard-page card block missing")
        scroll_body_in_desk = styles.find(
            ".jp-vocab-teacher-quiz__scroll-body", en_desk
        )
        if scroll_body_in_desk < 0 or scroll_body_in_desk > en_desk + 2500:
            fail("desktop en-vocab scroll-body override missing")
        desk_body = styles[scroll_body_in_desk : scroll_body_in_desk + 400]
    else:
        desk_body = styles[desk_idx : desk_idx + 400]
    if "overflow: visible" in desk_body:
        fail(
            "desktop en-vocab scroll-body must not use overflow: visible "
            "(reverts to whole-card scroll)"
        )
    if "overflow-y: auto" not in desk_body:
        fail("desktop en-vocab scroll-body must keep overflow-y: auto")

    print(
        "OK: en-vocab flashcard notes above panels; "
        "pinned chrome + middle scroll (下一个 always visible)"
    )


if __name__ == "__main__":
    main()
