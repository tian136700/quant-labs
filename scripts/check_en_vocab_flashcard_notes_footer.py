#!/usr/bin/env python3
"""Regression: EN flashcard notes under left info pane; mid-scroll; nav pinned."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODAL = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"
MODAL_DIR = ROOT / "src/components/en-vocab-teacher-quiz-flashcard"
STYLES = ROOT / "src/components/JpVocabTeacherQuizFlashcardStyles.tsx"
BODY = MODAL_DIR / "EnVocabFlashcardPageBody.tsx"
FOOTER = MODAL_DIR / "EnVocabFlashcardPageFooter.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def first_rule_block(styles: str, selector: str) -> str:
    idx = styles.find(selector)
    if idx < 0:
        fail(f"styles must define {selector.strip()}")
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
    if not BODY.is_file():
        fail(f"missing {BODY.relative_to(ROOT)}")
    if not FOOTER.is_file():
        fail(f"missing {FOOTER.relative_to(ROOT)}")

    modal_tsx = MODAL.read_text(encoding="utf-8")
    body = BODY.read_text(encoding="utf-8")
    footer = FOOTER.read_text(encoding="utf-8")
    styles = STYLES.read_text(encoding="utf-8")

    # Notes live under left info pane (Body), not footer
    if "en-vocab-flashcard-page__notes" not in body:
        fail("Body must render en-vocab-flashcard-page__notes under left column")
    if "en-vocab-flashcard-page__notes-body" not in body:
        fail("Body must use en-vocab-flashcard-page__notes-body (scrollable)")
    if "EnVocabClassNoteContent" not in body:
        fail("Body notes must use EnVocabClassNoteContent (thumbnails + zoom)")
    if "onViewRemarks" not in body:
        fail("Body must expose 查看全部 via onViewRemarks")
    if "jp-vocab-teacher-quiz__info" not in body:
        fail("Body must keep jp-vocab-teacher-quiz__info (second pane)")

    info_pos = body.find('className="jp-vocab-teacher-quiz__info"')
    notes_pos = body.find("en-vocab-flashcard-page__notes")
    if info_pos < 0 or notes_pos < 0 or notes_pos < info_pos:
        fail("notes must appear after jp-vocab-teacher-quiz__info (below second pane)")

    if "en-vocab-flashcard-page-footer__notes" in footer:
        fail("Footer must NOT host notes (moved under left info pane)")
    if "jp-vocab-teacher-quiz__notes" in footer:
        fail("Footer must NOT render jp-vocab-teacher-quiz__notes")

    # Side column must not host notes
    side_idx = body.find('className="en-vocab-flashcard-page__col-side"')
    if side_idx >= 0:
        side_chunk = body[side_idx:]
        if "jp-vocab-teacher-quiz__notes" in side_chunk:
            fail("notes must not live inside en-vocab-flashcard-page__col-side")

    if "en-vocab-flashcard-page__scroll" not in modal_tsx:
        fail("modal must wrap body+footer in en-vocab-flashcard-page__scroll")
    if "en-vocab-flashcard-page__nav" not in modal_tsx:
        fail("modal nav must use en-vocab-flashcard-page__nav (pinned button pane)")

    scroll_idx = modal_tsx.find('className="en-vocab-flashcard-page__scroll"')
    footer_comp = modal_tsx.find("<EnVocabFlashcardPageFooter")
    nav_idx = modal_tsx.find("en-vocab-flashcard-page__nav")
    if scroll_idx < 0 or footer_comp < 0 or nav_idx < 0:
        fail("scroll / EnVocabFlashcardPageFooter / __nav markers missing in modal")
    if not (scroll_idx < footer_comp < nav_idx):
        fail("modal order must be __scroll → Footer → __nav")

    if "en-vocab-flashcard-page__scroll" not in styles:
        fail("styles must define .en-vocab-flashcard-page__scroll")
    if "en-vocab-flashcard-page__nav" not in styles:
        fail("styles must pin .en-vocab-flashcard-page__nav")
    if "en-vocab-flashcard-page__notes-body" not in styles:
        fail("styles must define scrollable .en-vocab-flashcard-page__notes-body")

    # Prefer dedicated class; also accept card-scoped notes-body override
    notes_body_idx = styles.find(".en-vocab-flashcard-page__notes-body")
    if notes_body_idx < 0:
        fail("styles must mention en-vocab-flashcard-page__notes-body")
    notes_body_region = styles[notes_body_idx : notes_body_idx + 500]
    if "overflow-y: auto" not in notes_body_region:
        fail("en-vocab notes-body styles must use overflow-y: auto")
    if "max-height" not in notes_body_region:
        fail("en-vocab notes-body styles must set max-height")

    card_block = first_rule_block(
        styles, ".jp-vocab-teacher-quiz-card.en-vocab-flashcard-page {"
    )
    if "overflow: hidden" not in card_block:
        fail("en-vocab-flashcard-page card must use overflow: hidden")
    if "overflow-y: auto" in card_block.split("}")[0]:
        fail("en-vocab-flashcard-page card must NOT whole-card scroll")
    if "height: auto" in card_block.split("}")[0]:
        fail("en-vocab-flashcard-page card must use bounded height, not height: auto")

    scroll_block = first_rule_block(styles, ".en-vocab-flashcard-page__scroll {")
    if "overflow-y: auto" not in scroll_block:
        fail("en-vocab-flashcard-page__scroll must use overflow-y: auto")
    if "flex: 1 1 auto" not in scroll_block:
        fail("en-vocab-flashcard-page__scroll must flex-grow")
    if "min-height: 0" not in scroll_block:
        fail("en-vocab-flashcard-page__scroll must set min-height: 0")

    print(
        "OK: en-vocab notes under left info pane (scroll + view-all); "
        "mid-scroll; nav pinned"
    )


if __name__ == "__main__":
    main()
