#!/usr/bin/env python3
"""教案图保存到相册：确认一次 + 成功只提示「已保存到相册」（勿二次引导）。"""

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
                "vocabRefSaveResultToast",
                "已保存到相册",
                "navigator.canShare",
                "navigator.share",
                "AbortError",
            ],
        ):
            errors.append(f"{helper.relative_to(ROOT)}: missing {n!r}")
        bad = "请在分享面板选择"
        if bad in helper.read_text(encoding="utf-8"):
            errors.append(f"{helper.relative_to(ROOT)}: must not tell user to save twice ({bad!r})")

    zoom = ROOT / "src/components/VocabRefImageZoom.tsx"
    zoom_text = zoom.read_text(encoding="utf-8")
    for n in must_contain(
        zoom,
        [
            "VOCAB_REF_IMAGE_LONG_PRESS_MS",
            "onImageLongPress",
            "longPressTimerRef",
            "onContextMenu",
            "WebkitTouchCallout",
        ],
    ):
        errors.append(f"{zoom.relative_to(ROOT)}: missing {n!r}")

    for rel in (
        "src/components/JpVocabRefDownloadMenu.tsx",
        "src/components/EnVocabRefDownloadMenu.tsx",
    ):
        path = ROOT / rel
        text = path.read_text(encoding="utf-8")
        for n in must_contain(
            path,
            [
                "saveVocabRefImageToDevice",
                "vocabRefSaveResultToast",
                "保存图片",
            ],
        ):
            errors.append(f"{rel}: missing {n!r}")
        if "请在分享面板选择" in text:
            errors.append(f"{rel}: must not prompt 请在分享面板选择（二次保存感）")

    for rel in (
        "src/components/JpVocabRefViewer.tsx",
        "src/components/EnVocabRefViewer.tsx",
    ):
        path = ROOT / rel
        text = path.read_text(encoding="utf-8")
        for n in must_contain(
            path,
            [
                "saveVocabRefImageToDevice",
                "vocabRefSaveResultToast",
                "savePromptOpen",
                "是否保存到相册",
                "长按保存到相册",
                "setSavePromptOpen(true)",
            ],
        ):
            errors.append(f"{rel}: missing {n!r}")
        if "请在分享面板选择" in text:
            errors.append(f"{rel}: must not prompt 请在分享面板选择")

    for rel in (
        "src/components/JpVocabRefPreviewModal.tsx",
        "src/components/EnVocabRefPreviewModal.tsx",
    ):
        path = ROOT / rel
        text = path.read_text(encoding="utf-8")
        for n in must_contain(
            path,
            [
                "saveVocabRefImageToDevice",
                "vocabRefSaveResultToast",
                "保存",
            ],
        ):
            errors.append(f"{rel}: missing {n!r}")
        if "请在分享面板选择" in text:
            errors.append(f"{rel}: must not prompt 请在分享面板选择")

    if errors:
        print("check_vocab_ref_save_image FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("check_vocab_ref_save_image OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
