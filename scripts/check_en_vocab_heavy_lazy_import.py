#!/usr/bin/env python3
"""Regression: English heavy exports must be lazy-loaded (Worker gzip).

Fails if:
1) EnVocabRefDownloadMenu statically imports en-vocab-ref-pdf-export
   (must await import on click; match JpVocabRefDownloadMenu).
2) EnVocabPage statically imports en-vocab-export
   (must await import on Excel click).
3) EnVocabPage statically imports EnVocabRiskChartModal
   (must next/dynamic ssr:false; match JpVocabPage).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


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

    study_client = (
        SRC / "components" / "EnVocabStudyPageClient.tsx"
    ).read_text(encoding="utf-8")
    if "ssr: false" not in study_client or "EnVocabStudyPage" not in study_client:
        errs.append(
            "EnVocabStudyPageClient.tsx: must next/dynamic EnVocabStudyPage "
            "with { ssr: false }"
        )
    study_page = (SRC / "app" / "en-vocab" / "study" / "page.tsx").read_text(
        encoding="utf-8"
    )
    if "EnVocabStudyPageClient" not in study_page:
        errs.append(
            "app/en-vocab/study/page.tsx: must render EnVocabStudyPageClient "
            "(ssr:false cannot live in Server Component)"
        )
    if re.search(
        r"""from\s+["']@/components/EnVocabStudyPage["']""",
        study_page,
    ):
        errs.append(
            "app/en-vocab/study/page.tsx: do not static-import EnVocabStudyPage; "
            "use EnVocabStudyPageClient"
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
