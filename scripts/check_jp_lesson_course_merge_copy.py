#!/usr/bin/env python3
"""Regression: same-course row copy offers 仅本行 vs 合并整课 (no course-col merge)."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    pair = ROOT / "src/lib/jp-lesson-course-pair.ts"
    pair_text = pair.read_text(encoding="utf-8") if pair.is_file() else ""
    if not pair.is_file():
        errors.append("missing jp-lesson-course-pair.ts")
    if "buildJpLessonCoursePairMap" not in pair_text:
        errors.append("jp-lesson-course-pair must export buildJpLessonCoursePairMap")
    if "planJpLessonCourseColumns" in pair_text:
        errors.append("do not merge course column via planJpLessonCourseColumns")

    merge_pdf = ROOT / "src/lib/jp-lesson-course-merge-pdf.ts"
    merge_text = merge_pdf.read_text(encoding="utf-8") if merge_pdf.is_file() else ""
    if not merge_pdf.is_file():
        errors.append("missing jp-lesson-course-merge-pdf.ts")
    if "buildJpLessonCourseMergedPaginatedPdf" not in merge_text:
        errors.append("missing buildJpLessonCourseMergedPaginatedPdf")

    pdf_export = ROOT / "src/lib/jp-vocab-ref-pdf-export.ts"
    pdf_text = pdf_export.read_text(encoding="utf-8") if pdf_export.is_file() else ""
    if "buildMergedJpVocabRefPaginatedPdf" not in pdf_text:
        errors.append("jp-vocab-ref-pdf-export must export buildMergedJpVocabRefPaginatedPdf")

    shared = ROOT / "src/lib/jp-vocab-ref-shared.ts"
    shared_text = shared.read_text(encoding="utf-8") if shared.is_file() else ""
    if "jpLessonCourseMergeRefKey" not in shared_text:
        errors.append("missing jpLessonCourseMergeRefKey")

    route = ROOT / "src/app/api/jp-lesson/course-merge-ref/route.ts"
    route_text = route.read_text(encoding="utf-8") if route.is_file() else ""
    if not route.is_file():
        errors.append("missing course-merge-ref/route.ts")
    if "jpLessonCourseMergeRefKey" not in route_text:
        errors.append("course-merge-ref must use jpLessonCourseMergeRefKey")
    if "ref_view_path" not in route_text:
        errors.append("course-merge-ref must return ref_view_path")

    copy_menu = ROOT / "src/components/JpLessonCopyMenu.tsx"
    copy_text = copy_menu.read_text(encoding="utf-8") if copy_menu.is_file() else ""
    if not copy_menu.is_file():
        errors.append("missing JpLessonCopyMenu.tsx")
    if "仅复制单词" not in copy_text or "仅复制语法" not in copy_text:
        errors.append("CopyMenu must offer 仅复制单词 / 仅复制语法")
    if "复制合并整课" not in copy_text:
        errors.append("CopyMenu must offer 复制合并整课")
    if "onCopyCourseMerge" not in copy_text or "coursePair" not in copy_text:
        errors.append("CopyMenu must accept coursePair + onCopyCourseMerge")
    if "JpVocabSaveProgressBar" not in copy_text:
        errors.append("CopyMenu must show merge progress bar")

    cell = ROOT / "src/components/jp-lesson-page/JpLessonCourseMergeCell.tsx"
    if cell.is_file():
        errors.append("JpLessonCourseMergeCell must be removed (no course-col merge button)")

    table = ROOT / "src/components/jp-lesson-page/JpLessonStatusTable.tsx"
    table_text = table.read_text(encoding="utf-8") if table.is_file() else ""
    if "rowSpan" in table_text and "course" in table_text.lower():
        # allow other rowspan? check specifically course col rowspan wiring
        if "courseRowSpan" in table_text or "skipCourseCol" in table_text:
            errors.append("StatusTable must not rowspan/skip 教材 column for course merge")
    if "JpLessonCourseMergeCell" in table_text:
        errors.append("StatusTable must not use JpLessonCourseMergeCell")
    if "coursePair=" not in table_text and "coursePair={" not in table_text:
        errors.append("StatusTable must pass coursePair into JpLessonCopyMenu")
    if "复制整课" in table_text and "复制合并整课" not in copy_text:
        errors.append("do not put standalone 复制整课 under 教材 column")

    hook = ROOT / "src/components/jp-lesson-page/useJpLessonCourseMergeCopy.ts"
    hook_text = hook.read_text(encoding="utf-8") if hook.is_file() else ""
    if "/api/jp-lesson/course-merge-ref" not in hook_text:
        errors.append("merge hook must POST course-merge-ref")
    if "整课合并需要两侧都有教案图" not in hook_text:
        errors.append("merge hook must toast when either side lacks image")

    page = ROOT / "src/components/JpLessonPage.tsx"
    page_text = page.read_text(encoding="utf-8") if page.is_file() else ""
    if "CopyToast" not in page_text:
        errors.append("JpLessonPage must mount CopyToast")
    if "useJpLessonCourseMergeCopy" not in page_text:
        errors.append("JpLessonPage must wire useJpLessonCourseMergeCopy")

    docs = ROOT / "docs/jp-lesson-upload-mixed-api.txt"
    if docs.is_file():
        doc_text = docs.read_text(encoding="utf-8")
        if "复制合并整课" not in doc_text and "仅复制单词" not in doc_text:
            errors.append(
                "docs/jp-lesson-upload-mixed-api.txt must mention row copy 仅本行/合并"
            )
    else:
        errors.append("missing docs/jp-lesson-upload-mixed-api.txt")

    api_doc = ROOT / "docs/jp-lesson-course-merge-ref-api.txt"
    if not api_doc.is_file():
        errors.append("missing docs/jp-lesson-course-merge-ref-api.txt")

    rule = ROOT / ".cursor/rules/jp-lesson-course-merge-copy.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/jp-lesson-course-merge-copy.mdc")
    else:
        rule_text = rule.read_text(encoding="utf-8")
        if "教材列不合并" not in rule_text and "不要" not in rule_text:
            errors.append("rule must say 教材列不合并格子")
        if "仅复制单词" not in rule_text:
            errors.append("rule must mention 仅复制单词 / 合并")

    if errors:
        print("check_jp_lesson_course_merge_copy FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_jp_lesson_course_merge_copy OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
