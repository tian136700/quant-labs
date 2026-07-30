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
5) JpVocabPage / jp-vocab-coach statically import @/lib/jp-vocab-export
   (must use @/lib/jp-vocab-export-select for filters; await import export).
6) tool-dot conversion/convert.ts statically imports docx
   (must await import("docx")).
7) Jp/En lesson pages statically import *LessonAnnotateModal
   (must next/dynamic { ssr: false }; PDF 随手画含 pdfjs/jspdf).
8) lesson-annotate hooks statically import lesson-annotate-pdf
   (must await import() when opening/saving PDF).
9) /jp-lesson /en-lesson and /jp-vocab/ref /en-vocab/ref must use
   *PageClient / *RefViewerClient shells (ssr: false) — same Worker gzip
   pattern as study pages.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


def check_ssr_false_shell(
    errs: list[str],
    *,
    client_name: str,
    inner_name: str,
    app_page: Path,
    app_label: str,
) -> None:
    """Client shell with next/dynamic({ ssr: false }); route must not static-import inner."""
    client_path = SRC / "components" / f"{client_name}.tsx"
    if not client_path.is_file():
        errs.append(f"{client_name}.tsx: missing (need ssr:false shell for Worker gzip)")
        return
    client_src = client_path.read_text(encoding="utf-8")
    if "ssr: false" not in client_src or inner_name not in client_src:
        errs.append(
            f"{client_name}.tsx: must next/dynamic {inner_name} with {{ ssr: false }}"
        )
    if not app_page.is_file():
        errs.append(f"{app_label}: missing")
        return
    page_src = app_page.read_text(encoding="utf-8")
    if client_name not in page_src:
        errs.append(
            f"{app_label}: must render {client_name} "
            "(ssr:false cannot live in Server Component)"
        )
    if re.search(
        rf"""from\s+["']@/components/{inner_name}["']""",
        page_src,
    ):
        errs.append(
            f"{app_label}: do not static-import {inner_name}; use {client_name}"
        )


def check_study_shell(
    errs: list[str],
    *,
    lang: str,
    client_name: str,
    page_name: str,
    app_subdir: str,
) -> None:
    del lang  # kept for call-site clarity
    check_ssr_false_shell(
        errs,
        client_name=client_name,
        inner_name=page_name,
        app_page=SRC / "app" / app_subdir / "study" / "page.tsx",
        app_label=f"app/{app_subdir}/study/page.tsx",
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

    page_parts = [
        (SRC / "components" / "EnVocabPage.tsx").read_text(encoding="utf-8")
    ]
    page_dir = SRC / "components" / "en-vocab-page"
    if page_dir.is_dir():
        for f in sorted(page_dir.glob("*.tsx")):
            page_parts.append(f.read_text(encoding="utf-8"))
    admin_actions = SRC / "hooks" / "useEnVocabAdminActions.ts"
    if admin_actions.is_file():
        page_parts.append(admin_actions.read_text(encoding="utf-8"))
    page = "\n".join(page_parts)
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

    check_ssr_false_shell(
        errs,
        client_name="JpLessonPageClient",
        inner_name="JpLessonPage",
        app_page=SRC / "app" / "jp-lesson" / "page.tsx",
        app_label="app/jp-lesson/page.tsx",
    )
    check_ssr_false_shell(
        errs,
        client_name="EnLessonPageClient",
        inner_name="EnLessonPage",
        app_page=SRC / "app" / "en-lesson" / "page.tsx",
        app_label="app/en-lesson/page.tsx",
    )
    check_ssr_false_shell(
        errs,
        client_name="JpVocabRefViewerClient",
        inner_name="JpVocabRefViewer",
        app_page=SRC / "app" / "jp-vocab" / "ref" / "[refKey]" / "page.tsx",
        app_label="app/jp-vocab/ref/[refKey]/page.tsx",
    )
    check_ssr_false_shell(
        errs,
        client_name="EnVocabRefViewerClient",
        inner_name="EnVocabRefViewer",
        app_page=SRC / "app" / "en-vocab" / "ref" / "[refKey]" / "page.tsx",
        app_label="app/en-vocab/ref/[refKey]/page.tsx",
    )

    jp_page = (SRC / "components" / "JpVocabPage.tsx").read_text(encoding="utf-8")
    if re.search(r"""from\s+["']@/lib/jp-vocab-export["']""", jp_page):
        errs.append(
            "JpVocabPage.tsx: do not static-import @/lib/jp-vocab-export; "
            "use @/lib/jp-vocab-export-select for filters"
        )
    coach = (SRC / "lib" / "jp-vocab-coach.ts").read_text(encoding="utf-8")
    if re.search(r"""from\s+["']@/lib/jp-vocab-export["']""", coach):
        errs.append(
            "jp-vocab-coach.ts: do not static-import @/lib/jp-vocab-export; "
            "use @/lib/jp-vocab-export-select"
        )
    export_actions = (SRC / "hooks" / "useJpVocabExportActions.ts").read_text(
        encoding="utf-8"
    )
    if re.search(r"""from\s+["']@/lib/jp-vocab-export["']""", export_actions):
        errs.append(
            "useJpVocabExportActions.ts: static value import of "
            "@/lib/jp-vocab-export pulls Word/docx into the page graph; "
            "import filters from jp-vocab-export-select and await import() export"
        )
    convert = (SRC / "tool-dot" / "conversion" / "convert.ts").read_text(
        encoding="utf-8"
    )
    if re.search(r"""from\s+["']docx["']""", convert):
        errs.append(
            "tool-dot/conversion/convert.ts: do not static-import docx; "
            "await import(\"docx\")"
        )

    # 日语/英语新课随手画：含 pdfjs + jspdf，必须客户端懒加载
    jp_modals = (
        SRC / "components" / "jp-lesson-page" / "JpLessonPageModals.tsx"
    ).read_text(encoding="utf-8")
    if re.search(
        r"""import\s*\{\s*JpLessonAnnotateModal\s*\}\s*from\s*["']@/components/JpLessonAnnotateModal["']""",
        jp_modals,
    ):
        errs.append(
            "JpLessonPageModals.tsx: JpLessonAnnotateModal must use "
            "next/dynamic ({ ssr: false }), not a static import"
        )
    if "next/dynamic" not in jp_modals or "JpLessonAnnotateModal" not in jp_modals:
        errs.append(
            "JpLessonPageModals.tsx: missing next/dynamic JpLessonAnnotateModal"
        )
    if "ssr: false" not in jp_modals:
        errs.append(
            "JpLessonPageModals.tsx: JpLessonAnnotateModal dynamic must set "
            "{ ssr: false }"
        )

    en_lesson = (SRC / "components" / "EnLessonPage.tsx").read_text(encoding="utf-8")
    if re.search(
        r"""import\s*\{\s*EnLessonAnnotateModal\s*\}\s*from\s*["']@/components/EnLessonAnnotateModal["']""",
        en_lesson,
    ):
        errs.append(
            "EnLessonPage.tsx: EnLessonAnnotateModal must use "
            "next/dynamic ({ ssr: false }), not a static import"
        )
    if "next/dynamic" not in en_lesson or "EnLessonAnnotateModal" not in en_lesson:
        errs.append(
            "EnLessonPage.tsx: missing next/dynamic EnLessonAnnotateModal"
        )
    if "ssr: false" not in en_lesson:
        errs.append(
            "EnLessonPage.tsx: EnLessonAnnotateModal dynamic must set "
            "{ ssr: false }"
        )

    for hook_name in (
        "useLessonAnnotatePdfPages.ts",
        "useLessonAnnotatePersist.ts",
    ):
        hook = (
            SRC / "components" / "lesson-annotate" / hook_name
        ).read_text(encoding="utf-8")
        if re.search(
            r"""^import\s+(?!type\s)[^;]*from\s*["']@/components/lesson-annotate/lesson-annotate-pdf["']""",
            hook,
            flags=re.M,
        ):
            errs.append(
                f"{hook_name}: do not static-import lesson-annotate-pdf; "
                "await import() when PDF open/save (Worker gzip)"
            )
        if (
            "lesson-annotate-pdf" in hook
            and "await import(" not in hook
        ):
            errs.append(
                f"{hook_name}: missing await import("
                "\"@/components/lesson-annotate/lesson-annotate-pdf\")"
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
