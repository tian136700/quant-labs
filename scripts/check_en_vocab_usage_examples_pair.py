#!/usr/bin/env python3
"""Regression: en-vocab usage+examples are paired 1:1 for display (not two separate UI fields)."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def must_contain(path: pathlib.Path, needles: list[str]) -> list[str]:
    text = path.read_text(encoding="utf-8")
    missing = [n for n in needles if n not in text]
    return missing


def must_not_contain(path: pathlib.Path, needles: list[str]) -> list[str]:
    text = path.read_text(encoding="utf-8")
    found = [n for n in needles if n in text]
    return found


def main() -> int:
    errors: list[str] = []

    display_lib = ROOT / "src/lib/en-vocab-usage-examples-display.ts"
    if not display_lib.is_file():
        errors.append(f"missing {display_lib.relative_to(ROOT)}")
    else:
        display_text = display_lib.read_text(encoding="utf-8")
        for n in [
            "buildEnVocabUsageExamplePairs",
            "enVocabUsagePairLabel",
            "${n}.用法",
        ]:
            if n not in display_text:
                errors.append(f"{display_lib.name}: missing {n!r}")
        if "用法一" in display_text or "CN_ORDINALS" in display_text:
            errors.append(f"{display_lib.name}: must not use 用法一 / CN_ORDINALS")

    page = ROOT / "src/components/EnVocabPage.tsx"
    missing = must_contain(
        page,
        [
            "EnVocabUsageExamplesCell",
            "jp-vocab-usage-ex-col",
            "用法 / 例句",
        ],
    )
    for m in missing:
        errors.append(f"EnVocabPage.tsx: missing {m!r}")

    bad = must_not_contain(
        page,
        [
            "EnVocabExampleSentencesCell",
            "jp-vocab-example-col",
            'data-label="例句"',
            'data-label="用法"',
        ],
    )
    # allow jp-vocab-usage-ex-col; block separate usage-col header/cells
    text = page.read_text(encoding="utf-8")
    if "jp-vocab-usage-col" in text and "jp-vocab-usage-ex-col" in text:
        # only fail if old usage-col class still used as table column (not substring of usage-ex)
        if "jp-vocab-usage-col" in text.replace("jp-vocab-usage-ex-col", ""):
            errors.append("EnVocabPage.tsx: still uses separate jp-vocab-usage-col")
    for b in bad:
        errors.append(f"EnVocabPage.tsx: must not contain {b!r}")

    flash = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"
    missing_f = must_contain(
        flash,
        [
            "EnVocabUsageExamplesPairedContent",
            "buildEnVocabUsageExamplePairs",
            "用法与例句",
        ],
    )
    for m in missing_f:
        errors.append(f"EnVocabTeacherQuizFlashcardModal.tsx: missing {m!r}")

    if 'aria-label="例句"' in flash.read_text(encoding="utf-8") and 'aria-label="用法"' in flash.read_text(
        encoding="utf-8"
    ):
        errors.append("flashcard still has separate 例句 + 用法 sections")

    if errors:
        print("FAIL: en-vocab usage/examples pairing display guards")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("OK: en-vocab usage/examples paired display")
    return 0


if __name__ == "__main__":
    sys.exit(main())
