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
            "EnVocabUsageExamplesCopyButton",
        ],
    )
    for m in missing_f:
        errors.append(f"EnVocabTeacherQuizFlashcardModal.tsx: missing {m!r}")

    copy_btn = ROOT / "src/components/EnVocabUsageExamplesCopyButton.tsx"
    missing_copy = must_contain_text(
        copy_btn.read_text(encoding="utf-8") if copy_btn.is_file() else "",
        [
            "formatEnVocabUsageExamplesCopyText",
            "copyTextToClipboard",
            "CopyToast",
            "复制全部",
        ],
    )
    for m in missing_copy:
        errors.append(f"EnVocabUsageExamplesCopyButton.tsx: missing {m!r}")

    if 'aria-label="例句"' in flash_text and 'aria-label="用法"' in flash_text:
        errors.append("flashcard still has separate 例句 + 用法 sections")

    # 用法/例句来源展示相同只角标一次（勿各打一行 JpVocabSourceLabel）
    paired = ROOT / "src/components/EnVocabUsageExamplesPairedContent.tsx"
    paired_text = paired.read_text(encoding="utf-8") if paired.is_file() else ""
    if "uniqueJpVocabSourcesForDisplay" not in paired_text:
        errors.append(
            "EnVocabUsageExamplesPairedContent.tsx: must dedupe sources via "
            "uniqueJpVocabSourcesForDisplay"
        )
    source_lib = ROOT / "src/lib/jp-vocab-source-display.ts"
    source_text = (
        source_lib.read_text(encoding="utf-8") if source_lib.is_file() else ""
    )
    if "uniqueJpVocabSourcesForDisplay" not in source_text:
        errors.append(
            "jp-vocab-source-display.ts: missing uniqueJpVocabSourcesForDisplay"
        )

    usage_ai = (ROOT / "src/lib/en-vocab-usage-ai.ts").read_text(encoding="utf-8")
    if "至少写 2 条" in usage_ai or "至少 2 条编号" in usage_ai:
        errors.append("en-vocab-usage-ai: 禁止再强制至少 2 条用法")
    if "need_two_points" in usage_ai:
        errors.append("en-vocab-usage-ai: 须改为允许 1 条（勿再 need_two_points）")
    if "points.length < 1" not in usage_ai and "need_one_point" not in usage_ai:
        errors.append("en-vocab-usage-ai: 校验须允许仅 1 条用法")
    if "禁止为了凑数" not in usage_ai and "硬凑" not in usage_ai:
        errors.append("en-vocab-usage-ai prompt: 须写明禁止硬凑组数")

    fill_rule = (ROOT / ".cursor/rules/en-vocab-fill.mdc").read_text(encoding="utf-8")
    if "至少 2 条（选题按学术考试高频" in fill_rule:
        errors.append("en-vocab-fill.mdc: 用法勿再写强制至少 2 条")

    if errors:
        print("FAIL: en-vocab usage/examples pairing display guards")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("OK: en-vocab usage/examples paired display")
    return 0


if __name__ == "__main__":
    sys.exit(main())
