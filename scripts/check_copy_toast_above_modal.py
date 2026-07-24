#!/usr/bin/env python3
"""Regression: CopyToast inside flashcards/modals must use copy-toast--above-modal.

Default .copy-toast is z-index 1000; teacher quiz sheet ~1002 and usage view ~1100
would hide the success toast unless className includes copy-toast--above-modal
(and that class stays above those overlays).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Components that copy from inside a high z-index overlay / flashcard sheet
MUST_ABOVE_MODAL = [
    ROOT / "src/components/EnVocabUsageExamplesCopyButton.tsx",
    ROOT / "src/components/EnVocabUsageViewModal.tsx",
    ROOT / "src/components/JpVocabExampleSentenceCopyButton.tsx",
    ROOT / "src/components/JpVocabFlashcardWordHero.tsx",
]

GLOBALS_CSS = ROOT / "src/app/globals/globals-forms.css"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    css = GLOBALS_CSS.read_text(encoding="utf-8")
    m = re.search(
        r"\.copy-toast--above-modal\s*\{[^}]*z-index:\s*(\d+)",
        css,
    )
    if not m:
        fail("missing .copy-toast--above-modal z-index in globals-forms.css")
    z = int(m.group(1))
    if z < 1200:
        fail(
            f".copy-toast--above-modal z-index={z} must be >= 1200 "
            "(above en-usage-view-overlay ~1100 and quiz sheet ~1002)"
        )

    for path in MUST_ABOVE_MODAL:
        if not path.is_file():
            fail(f"missing {path}")
        src = path.read_text(encoding="utf-8")
        if "CopyToast" not in src:
            fail(f"{path.name}: expected CopyToast")
        if "copy-toast--above-modal" not in src:
            fail(
                f"{path.name}: CopyToast inside modal/flashcard must use "
                'className="copy-toast--above-modal" (else toast is hidden)'
            )
        print(f"OK: {path.relative_to(ROOT)}")

    print(f"OK: copy-toast--above-modal z-index={z}")
    print("All copy-toast above-modal guards passed.")


if __name__ == "__main__":
    main()
