#!/usr/bin/env python3
"""教案图保存到相册：helper + 菜单 + 长按确认（防 iOS 长按被缩放层吃掉）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needles: list[str]) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return [n for n in needles if n not in text]


def main() -> int:
    errors: list[str] = []

    helper = ROOT / "src/lib/vocab-ref-save-image.ts"
    if not helper.is_file():
        errors.append("missing src/lib/vocab-ref-save-image.ts")
    else:
        for n in must_contain(
            helper,
            [
                "saveVocabRefImageToDevice",
                "navigator.canShare",
                "navigator.share",
                "AbortError",
            ],
        ):
            errors.append(f"{helper.relative_to(ROOT)}: missing {n!r}")

    zoom = ROOT / "src/components/VocabRefImageZoom.tsx"
    for n in must_contain(
        zoom,
        [
            "VOCAB_REF_IMAGE_LONG_PRESS_MS",
            "onImageLongPress",
            "longPressTimerRef",
        ],
    ):
        errors.append(f"{zoom.relative_to(ROOT)}: missing {n!r}")

    for rel in (
        "src/components/JpVocabRefDownloadMenu.tsx",
        "src/components/EnVocabRefDownloadMenu.tsx",
    ):
        path = ROOT / rel
        for n in must_contain(
            path,
            [
                "saveVocabRefImageToDevice",
                "保存图片",
                "存储图像",
            ],
        ):
            errors.append(f"{rel}: missing {n!r}")

    for rel in (
        "src/components/JpVocabRefViewer.tsx",
        "src/components/EnVocabRefViewer.tsx",
    ):
        path = ROOT / rel
        for n in must_contain(
            path,
            [
                "saveVocabRefImageToDevice",
                "savePromptOpen",
                "长按保存到相册",
                "setSavePromptOpen(true)",
            ],
        ):
            errors.append(f"{rel}: missing {n!r}")

    for rel in (
        "src/components/JpVocabRefPreviewModal.tsx",
        "src/components/EnVocabRefPreviewModal.tsx",
    ):
        path = ROOT / rel
        for n in must_contain(
            path,
            [
                "saveVocabRefImageToDevice",
                "保存",
            ],
        ):
            errors.append(f"{rel}: missing {n!r}")

    if errors:
        print("check_vocab_ref_save_image FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("check_vocab_ref_save_image OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
