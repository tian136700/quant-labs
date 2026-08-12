#!/usr/bin/env python3
"""英语整图 PDF：电脑直接下载；手机才系统分享进「文件」。禁止桌面误走「保存到手机」。"""

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
        helper_text = helper.read_text(encoding="utf-8")
        for n in must_contain(
            helper,
            [
                "prefersVocabRefPdfShare",
                "saveVocabRefPdfToDevice",
                "vocabRefPdfSaveResultToast",
                "PDF 已保存",
                "PDF 已下载",
                "navigator.canShare",
                "navigator.share",
                "AbortError",
                "application/pdf",
                "iPhone|iPod|iPad",
            ],
        ):
            errors.append(f"{helper.relative_to(ROOT)}: missing {n!r}")
        # 必须先判断 prefers，不能仅靠 canShare 就 share（桌面 Chrome 会误伤）
        share_guard = "if (prefersVocabRefPdfShare())"
        if share_guard not in helper_text:
            errors.append(
                f"{helper.relative_to(ROOT)}: must gate share with prefersVocabRefPdfShare()"
            )
        bad = "请在分享面板选择"
        if bad in helper_text:
            errors.append(
                f"{helper.relative_to(ROOT)}: must not tell user to save twice ({bad!r})"
            )

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
            "prefersVocabRefPdfShare",
            "saveVocabRefPdfToDevice",
            "vocabRefPdfSaveResultToast",
            "window.confirm",
            "存储到文件",
            "电脑直接下载",
            "SHOW_PAGINATED_EXPORTS",
            "整图 PDF",
        ],
    ):
        errors.append(f"{menu.relative_to(ROOT)}: missing {n!r}")
    if "保存到手机" in menu_text:
        errors.append(
            f"{menu.relative_to(ROOT)}: must not say 保存到手机 on desktop path"
        )
    if "请在分享面板选择" in menu_text:
        errors.append(f"{menu.relative_to(ROOT)}: must not prompt 请在分享面板选择")
    # confirm 仅手机：须包在 prefersVocabRefPdfShare 分支里
    if "if (prefersVocabRefPdfShare())" not in menu_text:
        errors.append(
            f"{menu.relative_to(ROOT)}: confirm/share UX must be gated by prefersVocabRefPdfShare()"
        )

    if errors:
        print("check_vocab_ref_save_pdf FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("check_vocab_ref_save_pdf OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
