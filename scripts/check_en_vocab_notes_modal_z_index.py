#!/usr/bin/env python3
"""Regression: EN notes/edit/view modals must sit above the teacher quiz flashcard overlay.

Flashcard overlay is z-index 1002. If notes edit/view/edit-word use <=1000,
tapping「编辑备注」on mobile opens the modal behind the card — looks like
upload/edit is broken.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FLASHCARD_STYLES = ROOT / "src/components/JpVocabTeacherQuizFlashcardStyles.tsx"

# (path, overlay CSS class selector fragment, min z-index)
MODALS: list[tuple[Path, str, int]] = [
    (
        ROOT / "src/components/EnClassNotesEditModal.tsx",
        ".jp-notes-edit-overlay",
        1100,
    ),
    (
        ROOT / "src/components/EnVocabRemarksViewModal.tsx",
        ".jp-remarks-view-overlay",
        1100,
    ),
    (
        ROOT / "src/components/EnVocabEditModal.tsx",
        ".jp-vocab-edit-overlay",
        1100,
    ),
    (
        ROOT / "src/components/EnVocabFieldEditModal.tsx",
        ".jp-field-edit-overlay",
        1100,
    ),
]

FLASHCARD_MIN = 1002
Z_RE = re.compile(r"z-index\s*:\s*(\d+)\s*;")


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def first_rule_block(src: str, selector: str) -> str:
    idx = src.find(selector)
    if idx < 0:
        fail(f"missing selector {selector!r}")
    brace = src.find("{", idx)
    if brace < 0:
        fail(f"no '{{' after {selector!r}")
    depth = 0
    for i in range(brace, len(src)):
        ch = src[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return src[idx : i + 1]
    fail(f"unclosed block for {selector!r}")
    return ""


def z_index_in_block(block: str) -> int:
    m = Z_RE.search(block)
    if not m:
        fail(f"no z-index in block starting {block[:60]!r}…")
    return int(m.group(1))


def main() -> None:
    if not FLASHCARD_STYLES.is_file():
        fail(f"missing {FLASHCARD_STYLES.relative_to(ROOT)}")

    styles = FLASHCARD_STYLES.read_text(encoding="utf-8")
    # Teacher quiz overlay (shared JP/EN class)
    overlay_block = first_rule_block(styles, ".jp-vocab-teacher-quiz-overlay")
    flash_z = z_index_in_block(overlay_block)
    if flash_z < FLASHCARD_MIN:
        fail(
            f"flashcard overlay z-index {flash_z} < expected ≥{FLASHCARD_MIN} "
            f"(modals assume card is around 1002)"
        )

    for path, selector, min_z in MODALS:
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")
        text = path.read_text(encoding="utf-8")
        block = first_rule_block(text, selector)
        z = z_index_in_block(block)
        if z <= flash_z:
            fail(
                f"{path.name} {selector} z-index={z} must be > flashcard "
                f"overlay z-index={flash_z} (need ≥{min_z})"
            )
        if z < min_z:
            fail(f"{path.name} {selector} z-index={z} < required {min_z}")

    print(
        "OK: EN notes/edit/view/field modals z-index > flashcard overlay "
        f"({flash_z})"
    )


if __name__ == "__main__":
    main()
