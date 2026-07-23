#!/usr/bin/env python3
"""Regression: Vocab heavy pages/exports must be lazy-loaded (Worker gzip).

Fails if:
1) EnVocabRefDownloadMenu statically imports en-vocab-ref-pdf-export
   (must await import on click; match JpVocabRefDownloadMenu).
2) EnVocabPage statically imports en-vocab-export
   (must await import on Excel click).
3) EnVocabPage statically imports EnVocabRiskChartModal
   (must next/dynamic ssr:false; match JpVocabPage).
4) /en-vocab/study or /jp-vocab/study statically imports *StudyPage
   (must *StudyPageClient + next/dynamic { ssr: false }).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


def check_study_shell(
    errs: list[str],
    *,
    lang: str,
    client_name: str,
    page_name: str,
    app_subdir: str,
) -> None:
    client_path = SRC / "components" / f"{client_name}.tsx"
    if not client_path.is_file():
        errs.append(f"{client_name}.tsx: missing (need ssr:false shell for Worker gzip)")
        return
    study_client = client_path.read_text(encoding="utf-8")
    if "ssr: false" not in study_client or page_name not in study_client:
        errs.append(
            f"{client_name}.tsx: must next/dynamic {page_name} with {{ ssr: false }}"
        )
    study_page = (SRC / "app" / app_subdir / "study" / "page.tsx").read_text(
        encoding="utf-8"
    )
    if client_name not in study_page:
        errs.append(
            f"app/{app_subdir}/study/page.tsx: must render {client_name} "
            "(ssr:false cannot live in Server Component)"
        )
    if re.search(
        rf"""from\s+["']@/components/{page_name}["']""",
        study_page,
    ):
        errs.append(
            f"app/{app_subdir}/study/page.tsx: do not static-import {page_name}; "
            f"use {client_name}"
        )


def main() -> int:
    errs: list[str] = []

    menu = (SRC / "components" / "EnVocabRefDownloadMenu.tsx").read_text(
        encoding="utf-8"
    )
    if re.search(
        r"""from\s+["']@/lib/en-vocab-ref-pdf-export["']""",
        menu,
    ):
        errs.append(
            "EnVocabRefDownloadMenu.tsx: do not static-import "
            "@/lib/en-vocab-ref-pdf-export; await import() on click "
            "(see JpVocabRefDownloadMenu)"
        )
    if "await import(" not in menu or "en-vocab-ref-pdf-export" not in menu:
        errs.append(
            "EnVocabRefDownloadMenu.tsx: missing await import("
            "@/lib/en-vocab-ref-pdf-export\") on export actions"
        )

    page = (SRC / "components" / "EnVocabPage.tsx").read_text(encoding="utf-8")
    if re.search(r"""from\s+["']@/lib/en-vocab-export["']""", page):
        errs.append(
            "EnVocabPage.tsx: do not static-import @/lib/en-vocab-export; "
            "await import() when exporting Excel"
        )
    if not re.search(
        r"""await\s+import\(\s*["']@/lib/en-vocab-export["']\s*\)""",
        page,
    ):
        errs.append(
            "EnVocabPage.tsx: missing await import(\"@/lib/en-vocab-export\")"
        )
    if re.search(
        r"""import\s*\{\s*EnVocabRiskChartModal\s*\}\s*from\s*["']@/components/EnVocabRiskChartModal["']""",
        page,
    ):
        errs.append(
            "EnVocabPage.tsx: EnVocabRiskChartModal must use next/dynamic "
            "({ ssr: false }), not a static import"
        )
    if "next/dynamic" not in page or "EnVocabRiskChartModal" not in page:
        errs.append(
            "EnVocabPage.tsx: missing next/dynamic EnVocabRiskChartModal"
        )

    check_study_shell(
        errs,
        lang="en",
        client_name="EnVocabStudyPageClient",
        page_name="EnVocabStudyPage",
        app_subdir="en-vocab",
    )
    check_study_shell(
        errs,
        lang="jp",
        client_name="JpVocabStudyPageClient",
        page_name="JpVocabStudyPage",
        app_subdir="jp-vocab",
    )

    if errs:
        print("check_en_vocab_heavy_lazy_import: FAIL", file=sys.stderr)
        for e in errs:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print("check_en_vocab_heavy_lazy_import: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
