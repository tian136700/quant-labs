#!/usr/bin/env python3
"""Regression: EN flashcard notes desktop under info; mobile under 抽查优先级; mid-scroll; nav pinned."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODAL = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"
MODAL_DIR = ROOT / "src/components/en-vocab-teacher-quiz-flashcard"
STYLES = ROOT / "src/components/JpVocabTeacherQuizFlashcardStyles.tsx"
BODY = MODAL_DIR / "EnVocabFlashcardPageBody.tsx"
FOOTER = MODAL_DIR / "EnVocabFlashcardPageFooter.tsx"
NOTES = MODAL_DIR / "EnVocabFlashcardNotesSection.tsx"


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
    if not NOTES.is_file():
        fail(f"missing {NOTES.relative_to(ROOT)}")

    modal_tsx = MODAL.read_text(encoding="utf-8")
    body = BODY.read_text(encoding="utf-8")
    footer = FOOTER.read_text(encoding="utf-8")
    notes = NOTES.read_text(encoding="utf-8")
    styles = STYLES.read_text(encoding="utf-8")

    if "EnVocabFlashcardNotesSection" not in notes:
        fail("NotesSection component missing export")
    if 'placement="desktop"' not in body and "placement=\"desktop\"" not in body:
        if 'placement="desktop"' not in body:
            fail("Body must render NotesSection placement=desktop under left column")
    if "EnVocabFlashcardNotesSection" not in body:
        fail("Body must render EnVocabFlashcardNotesSection")
    if "en-vocab-flashcard-page__notes--desktop" not in notes:
        fail("NotesSection must tag desktop placement class")
    if "en-vocab-flashcard-page__notes--mobile" not in notes:
        fail("NotesSection must tag mobile placement class")
    if "EnVocabClassNoteContent" not in notes:
        fail("Notes must use EnVocabClassNoteContent (thumbnails + zoom)")
    if "onViewRemarks" not in notes:
        fail("Notes must expose 查看全部 via onViewRemarks")
    if "jp-vocab-teacher-quiz__info" not in body:
        fail("Body must keep jp-vocab-teacher-quiz__info (second pane)")

    info_pos = body.find('className="jp-vocab-teacher-quiz__info"')
    notes_pos = body.find('placement="desktop"')
    if info_pos < 0 or notes_pos < 0 or notes_pos < info_pos:
        fail("desktop notes must appear after jp-vocab-teacher-quiz__info (below second pane)")

    # Mobile: notes live at bottom of 抽查优先级 stats block in Footer
    if "EnVocabFlashcardNotesSection" not in footer:
        fail("Footer must render NotesSection for mobile under 抽查优先级")
    if 'placement="mobile"' not in footer:
        fail("Footer NotesSection must use placement=mobile")
    stats_pos = footer.find('className="jp-vocab-teacher-quiz__stats"')
    mobile_notes_pos = footer.find('placement="mobile"')
    if stats_pos < 0 or mobile_notes_pos < 0 or mobile_notes_pos < stats_pos:
        fail("mobile notes must be inside/after jp-vocab-teacher-quiz__stats (抽查优先级块底)")

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
    if "en-vocab-flashcard-page__notes--desktop" not in styles:
        fail("styles must toggle notes--desktop by breakpoint")
    if "en-vocab-flashcard-page__notes--mobile" not in styles:
        fail("styles must toggle notes--mobile by breakpoint")

    # 电脑端近全屏：禁止 72/76rem 卡死；断点用 768/767（勿 1024）
    if "width: 96vw" not in styles and "width:96vw" not in styles:
        fail("EN flashcard desktop must use near-fullscreen width: 96vw")
    if "min(72rem" in styles or "min(76rem" in styles:
        fail(
            "EN flashcard must not cap width at 72rem/76rem "
            "(large desktop looks like a phone shell with side gutters)"
        )
    if "@media (min-width: 768px)" not in styles:
        fail("EN flashcard desktop breakpoint must be min-width: 768px")
    if "@media (max-width: 767px)" not in styles:
        fail("EN flashcard mobile breakpoint must be max-width: 767px")
    # 英语卡双栏/备注切换禁止再挂在 1025（笔记本窗口常 ≤1024 会整卡走手机）
    for bad in ("@media (min-width: 1025px)",):
        idx = 0
        while True:
            found = styles.find(bad, idx)
            if found < 0:
                break
            window = styles[found : found + 350]
            if "en-vocab-flashcard-page__notes--desktop" in window or (
                "en-vocab-flashcard-page" in window and "76rem" in window
            ):
                fail(
                    "EN flashcard desktop rules must use min-width: 768px, "
                    "not 1025px (laptop viewports often ≤1024)"
                )
            idx = found + len(bad)
    # 英语卡单栏/全屏手机态禁止挂在 1024
    idx = 0
    while True:
        found = styles.find("@media (max-width: 1024px)", idx)
        if found < 0:
            break
        window = styles[found : found + 400]
        if "en-vocab-flashcard-page__grid" in window and "minmax(0, 1fr)" in window:
            # 单栏 grid 若紧跟在 1024 媒体里 → 电脑窗口会误进手机单栏
            if "en-vocab-flashcard-page__grid" in window:
                fail(
                    "EN flashcard single-column grid must use max-width: 767px, "
                    "not 1024px"
                )
        if "en-vocab-flashcard-page__notes--desktop" in window and "display: none" in window:
            fail(
                "EN flashcard notes desktop/mobile toggle must use 767/768, "
                "not 1024"
            )
        idx = found + len("@media (max-width: 1024px)")

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
    if "flex: 1 1 0" not in scroll_block and "flex: 1 1 auto" not in scroll_block:
        fail("en-vocab-flashcard-page__scroll must flex-grow")
    if "min-height: 0" not in scroll_block:
        fail("en-vocab-flashcard-page__scroll must set min-height: 0")

    # 手机：导航钉底，勿用 100vh 撑出按钮下大块空白
    if "en-vocab-flashcard-page-overlay" not in styles:
        fail("styles must define en-vocab-flashcard-page-overlay")
    if "margin-top: auto" not in styles or "en-vocab-flashcard-page__nav" not in styles:
        fail("mobile EN flashcard nav must use margin-top: auto to pin bottom")
    mobile_vh_bad = (
        ".jp-vocab-teacher-quiz-card.en-vocab-flashcard-page {\n"
        "            width: 100%;\n"
        "            max-width: 100%;\n"
        "            height: min(100dvh, 100vh);"
    )
    if mobile_vh_bad in styles:
        fail(
            "mobile EN flashcard must not use height: min(100dvh, 100vh) "
            "(Chrome leaves empty space under 下一个)"
        )

    if "safe-area-inset-top" not in styles:
        fail("en-vocab flashcard styles must pad safe-area-inset-top on mobile")
    if "en-vocab-flashcard-page__nav-progress" not in modal_tsx:
        fail("modal must pin save progress on __nav-progress (visible while next disabled)")
    if "JpVocabSaveProgressBar" not in modal_tsx:
        fail("modal must use JpVocabSaveProgressBar for sync feedback")
    if "JpVocabSaveProgressBar" in footer:
        fail("Footer must NOT duplicate JpVocabSaveProgressBar (nav-only)")
    if "en-usage-ex-paired-levels.jp-vocab-levels" not in styles:
        fail("mobile styles must isolate usage-level chrome (.en-usage-ex-paired-levels)")
    if (
        ".jp-vocab-teacher-quiz-card .jp-vocab-levels {" in styles
        and ".jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__level .jp-vocab-levels {"
        not in styles
    ):
        fail(
            "mobile .jp-vocab-levels segment styles must be scoped under __level "
            "(so usage-side levels keep red outline only)"
        )
    # Mobile: usage / footer level checkboxes must stay visible on EN card
    if (
        "en-vocab-flashcard-page" in styles
        and ".en-usage-ex-paired-levels" in styles
        and "jp-vocab-check-box" in styles
    ):
        # Ensure we did not re-introduce blanket hide for EN usage levels
        hide_usage = (
            ".en-usage-ex-paired-levels\n            .jp-vocab-check-box {\n"
            "            display: none;"
        )
        if hide_usage in styles or (
            ".en-usage-ex-paired-levels" in styles
            and styles.count(
                ".en-vocab-flashcard-page\n            .en-usage-ex-paired-levels\n"
                "            .jp-vocab-check-box {\n            display: none"
            )
            > 0
        ):
            fail("EN mobile usage levels must NOT hide .jp-vocab-check-box")

    print(
        "OK: en-vocab notes desktop under info / mobile under 抽查优先级; "
        "mid-scroll; nav pinned; mobile safe-area + nav progress"
    )


if __name__ == "__main__":
    main()
