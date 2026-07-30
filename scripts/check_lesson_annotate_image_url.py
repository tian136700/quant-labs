#!/usr/bin/env python3
"""Regression: 随手画必须用教案图片 API，禁止把查看页 HTML 当 imageUrl。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_page_bundle(page: Path, sibling_dir: Path | None = None) -> str:
    """Page + optional extracted `*-page/` directory (Styles / Table / helpers)."""
    parts = [page.read_text(encoding="utf-8")]
    if sibling_dir is not None and sibling_dir.is_dir():
        for p in sorted(sibling_dir.glob("*.tsx")):
            parts.append(p.read_text(encoding="utf-8"))
        for p in sorted(sibling_dir.glob("*.ts")):
            parts.append(p.read_text(encoding="utf-8"))
    return "\n".join(parts)


CHECKS = [
    (
        "jp-lesson annotate open",
        read_page_bundle(
            ROOT / "src/components/JpLessonPage.tsx",
            ROOT / "src/components/jp-lesson-page",
        ),
        {
            "must": [
                r"jpVocabRefApiPath\(lesson\.ref_key!,\s*\{\s*v:\s*ref\.updated_at\s*\}\)",
                # page may pass setAnnotatingLesson; table calls onAnnotateLesson（可带 mediaType）
                r"(?:setAnnotatingLesson|onAnnotateLesson)\(\{\s*lesson,\s*ref:\s*ref!,\s*imageUrl",
                r"imageUrl=\{annotatingLesson\?\.imageUrl",
                r'media_type === "pdf"',
            ],
            "forbid": [
                r"setAnnotatingLesson\(\{[^}]*viewUrl",
                r"onAnnotateLesson\(\{[^}]*viewUrl",
                r"imageUrl=\{annotatingLesson\?\.viewUrl",
            ],
        },
    ),
    (
        "en-lesson annotate open",
        read_page_bundle(
            ROOT / "src/components/EnLessonPage.tsx",
            ROOT / "src/components/en-lesson-page",
        ),
        {
            "must": [
                r"enVocabRefApiPath\(lesson\.ref_key!,\s*\{\s*v:\s*ref\.updated_at\s*\}\)",
                r"(?:setAnnotatingLesson|onAnnotateLesson)\(\{\s*lesson,\s*ref:\s*ref!,\s*imageUrl",
                r"imageUrl=\{annotatingLesson\?\.imageUrl",
                r'media_type === "pdf"',
            ],
            "forbid": [
                r"setAnnotatingLesson\(\{[^}]*viewUrl",
                r"onAnnotateLesson\(\{[^}]*viewUrl",
                r"imageUrl=\{annotatingLesson\?\.viewUrl",
            ],
        },
    ),
    (
        "LessonAnnotateModal",
        # smear / replace 已拆到 Toolbar / draw / save；整目录一起扫
        read_page_bundle(
            ROOT / "src/components/lesson-annotate/LessonAnnotateModal.tsx",
            ROOT / "src/components/lesson-annotate",
        )
        + "\n"
        + (ROOT / "src/lib/lesson-annotate-browser-back.ts").read_text(encoding="utf-8"),
        {
            "must": [
                r"useLessonAnnotateBrowserBack\(",
                r"pushState\(",
                r'addEventListener\("popstate"',
                r"scrollLessonListItemIntoView\(",
                r'\["smear",\s*"涂抹"\]',
                r'SMEAR_COLOR\s*=\s*"#2a3140"',
                r'SMEAR_LABEL\s*=\s*"此内容由AI生成，经核验不准确，已涂抹"',
                r'type:\s*"rect"',
                r"normalizeRect\(",
                r"drawSmearLabel\(",
                r"tool === \"smear\"",
                r'subject === "jp" \? "/api/jp-lesson/ref/replace"',
                r"useLessonAnnotatePdfPages|openAnnotatePdfAsPages",
                r"LessonAnnotatePdfPagePreview|is-pdf-stack",
                r"DEFAULT_OPEN_ZOOM\s*=\s*1",
                r"ZOOM_MIN\s*=\s*0\.5",
                r"ZOOM_MAX\s*=\s*2",
                r"FIT_SIDE_GUTTER_PX",
                r"composeAnnotatedPdfBlob|saveAnnotateSession",
            ],
            "forbid": [
                r'SMEAR_COLOR\s*=\s*"#ffffff"',
                r'SMEAR_COLOR\s*=\s*"#000000"',
                r"SMEAR_WIDTH",
                r"DEFAULT_OPEN_ZOOM\s*=\s*Math\.min\(ZOOM_MAX,\s*ZOOM_STEP\s*\*\s*ZOOM_STEP\)",
                r"ZOOM_MIN\s*=\s*1\b",
            ],
        },
    ),
    (
        "lesson list + annotate view button",
        (ROOT / "src/components/jp-lesson-page/JpLessonStatusTable.tsx").read_text(
            encoding="utf-8"
        )
        + "\n"
        + (ROOT / "src/components/en-lesson-page/EnLessonStatusTable.tsx").read_text(
            encoding="utf-8"
        )
        + "\n"
        + (ROOT / "src/components/lesson-annotate/LessonAnnotateToolbar.tsx").read_text(
            encoding="utf-8"
        ),
        {
            "must": [
                r"jp-lesson-action-btn--view",
                r"查看",
                r"viewUrl",
            ],
            "forbid": [],
        },
    ),
    (
        "annotate wrappers",
        (ROOT / "src/components/JpLessonAnnotateModal.tsx").read_text(encoding="utf-8")
        + "\n"
        + (ROOT / "src/components/EnLessonAnnotateModal.tsx").read_text(encoding="utf-8"),
        {
            "must": [
                r"export function JpLessonAnnotateModal",
                r"export function EnLessonAnnotateModal",
                r'subject="jp"',
                r'subject="en"',
                r'from "@/components/lesson-annotate/LessonAnnotateModal"',
            ],
            "forbid": [],
        },
    ),
]


def main() -> int:
    failed = False
    for label, text, spec in CHECKS:
        for pat in spec["must"]:
            if not re.search(pat, text):
                print(f"FAIL {label}: missing /{pat}/")
                failed = True
        for pat in spec["forbid"]:
            if re.search(pat, text):
                print(f"FAIL {label}: forbidden /{pat}/")
                failed = True
    if failed:
        return 1
    print("OK: lesson annotate uses image API + smear tool")
    return 0


if __name__ == "__main__":
    sys.exit(main())
