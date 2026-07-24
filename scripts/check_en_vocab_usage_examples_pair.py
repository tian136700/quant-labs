#!/usr/bin/env python3
"""Regression: en-vocab usage+examples are paired 1:1 for display (not two separate UI fields)."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read_bundle(page: pathlib.Path, sibling: pathlib.Path | None = None) -> str:
    parts = [page.read_text(encoding="utf-8")] if page.is_file() else []
    if sibling is not None and sibling.is_dir():
        for f in sorted(sibling.glob("*.tsx")) + sorted(sibling.glob("*.ts")):
            parts.append(f.read_text(encoding="utf-8"))
    return "\n".join(parts)


def must_contain_text(text: str, needles: list[str]) -> list[str]:
    return [n for n in needles if n not in text]


def must_not_contain_text(text: str, needles: list[str]) -> list[str]:
    return [n for n in needles if n in text]


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
            "formatEnVocabUsageExamplesCopyText",
            "${n}.用法",
        ]:
            if n not in display_text:
                errors.append(f"{display_lib.name}: missing {n!r}")
        if "用法一" in display_text or "CN_ORDINALS" in display_text:
            errors.append(f"{display_lib.name}: must not use 用法一 / CN_ORDINALS")

    modal = ROOT / "src/components/EnVocabUsageViewModal.tsx"
    missing_modal = must_contain_text(
        modal.read_text(encoding="utf-8") if modal.is_file() else "",
        [
            "formatEnVocabUsageExamplesCopyText",
            "copyTextToClipboard",
            "CopyToast",
            "复制全部",
        ],
    )
    for m in missing_modal:
        errors.append(f"EnVocabUsageViewModal.tsx: missing {m!r}")

    page_text = read_bundle(
        ROOT / "src/components/EnVocabPage.tsx",
        ROOT / "src/components/en-vocab-page",
    )
    missing = must_contain_text(
        page_text,
        [
            "EnVocabUsageExamplesCell",
            "jp-vocab-usage-ex-col",
            "用法 / 例句",
        ],
    )
    for m in missing:
        errors.append(f"EnVocabPage.tsx: missing {m!r}")

    bad = must_not_contain_text(
        page_text,
        [
            "EnVocabExampleSentencesCell",
            "jp-vocab-example-col",
            'data-label="例句"',
            'data-label="用法"',
        ],
    )
    # allow jp-vocab-usage-ex-col; block separate usage-col header/cells
    if "jp-vocab-usage-col" in page_text.replace("jp-vocab-usage-ex-col", ""):
        errors.append("EnVocabPage.tsx: still uses separate jp-vocab-usage-col")
    for b in bad:
        errors.append(f"EnVocabPage.tsx: must not contain {b!r}")

    flash_text = read_bundle(
        ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx",
        ROOT / "src/components/en-vocab-teacher-quiz-flashcard",
    )
    missing_f = must_contain_text(
        flash_text,
        [
            "EnVocabUsageExamplesPairedContent",
            "buildEnVocabUsageExamplePairs",
            "用法与例句",
        ],
    )
    for m in missing_f:
        errors.append(f"EnVocabTeacherQuizFlashcardModal.tsx: missing {m!r}")

    if 'aria-label="例句"' in flash_text and 'aria-label="用法"' in flash_text:
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
