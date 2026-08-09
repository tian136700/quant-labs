#!/usr/bin/env python3
"""英语整图 PDF：须走系统分享进「文件」，禁止只靠 pdf.save() 被 Google Drive 抢走。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needles: list[str]) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return [n for n in needles if n not in text]


def main() -> int:
    errors: list[str] = []

    helper = ROOT / "src/lib/vocab-ref-save-pdf.ts"
    if not helper.is_file():
        errors.append("missing src/lib/vocab-ref-save-pdf.ts")
    else:
        for n in must_contain(
            helper,
            [
                "saveVocabRefPdfToDevice",
                "vocabRefPdfSaveResultToast",
                "PDF 已保存",
                "navigator.canShare",
                "navigator.share",
                "AbortError",
                "application/pdf",
            ],
        ):
            errors.append(f"{helper.relative_to(ROOT)}: missing {n!r}")
        bad = "请在分享面板选择"
        if bad in helper.read_text(encoding="utf-8"):
            errors.append(f"{helper.relative_to(ROOT)}: must not tell user to save twice ({bad!r})")

    export_path = ROOT / "src/lib/en-vocab-ref-pdf-export.ts"
    export_text = export_path.read_text(encoding="utf-8")
    for n in must_contain(
        export_path,
        [
            "buildEnVocabRefFullImagePdf",
            'pdf.output("arraybuffer")',
            "application/pdf",
        ],
    ):
        errors.append(f"{export_path.relative_to(ROOT)}: missing {n!r}")
    # 整图路径禁止再 pdf.save（分页/其它可另议；整图函数体须用 output）
    full_fn_start = export_text.find("export async function buildEnVocabRefFullImagePdf")
    full_fn_end = export_text.find(
        "export async function exportEnVocabRefFullImagePdf", full_fn_start
    )
    if full_fn_start < 0 or full_fn_end < 0:
        errors.append("en-vocab-ref-pdf-export.ts: missing build/export full image PDF fns")
    else:
        body = export_text[full_fn_start:full_fn_end]
        if "pdf.save(" in body:
            errors.append(
                "buildEnVocabRefFullImagePdf must not call pdf.save() "
                "(use output + share helper)"
            )

    menu = ROOT / "src/components/EnVocabRefDownloadMenu.tsx"
    menu_text = menu.read_text(encoding="utf-8")
    for n in must_contain(
        menu,
        [
            "buildEnVocabRefFullImagePdf",
            "saveVocabRefPdfToDevice",
            "vocabRefPdfSaveResultToast",
            "window.confirm",
            "存储到文件",
            "SHOW_PAGINATED_EXPORTS",
            "整图 PDF",
        ],
    ):
        errors.append(f"{menu.relative_to(ROOT)}: missing {n!r}")
    if "请在分享面板选择" in menu_text:
        errors.append(f"{menu.relative_to(ROOT)}: must not prompt 请在分享面板选择")

    if errors:
        print("check_vocab_ref_save_pdf FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("check_vocab_ref_save_pdf OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
