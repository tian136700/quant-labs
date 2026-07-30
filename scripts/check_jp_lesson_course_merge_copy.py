#!/usr/bin/env python3
"""Regression: same-course 教材列合并 + 整课合并复制链接."""

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
    if "planJpLessonCourseColumns" not in pair_text:
        errors.append("jp-lesson-course-pair must export planJpLessonCourseColumns")
    if "course_group_id" not in pair_text:
        errors.append("course pair logic must use course_group_id")

    merge_pdf = ROOT / "src/lib/jp-lesson-course-merge-pdf.ts"
    merge_text = merge_pdf.read_text(encoding="utf-8") if merge_pdf.is_file() else ""
    if not merge_pdf.is_file():
        errors.append("missing jp-lesson-course-merge-pdf.ts")
    if "buildJpLessonCourseMergedPaginatedPdf" not in merge_text:
        errors.append("missing buildJpLessonCourseMergedPaginatedPdf")
    if 'await import(' not in merge_text and 'import(' not in merge_text:
        errors.append("course-merge-pdf must lazy-import jp-vocab-ref-pdf-export")

    pdf_export = ROOT / "src/lib/jp-vocab-ref-pdf-export.ts"
    pdf_text = pdf_export.read_text(encoding="utf-8") if pdf_export.is_file() else ""
    if "buildMergedJpVocabRefPaginatedPdf" not in pdf_text:
        errors.append("jp-vocab-ref-pdf-export must export buildMergedJpVocabRefPaginatedPdf")

    shared = ROOT / "src/lib/jp-vocab-ref-shared.ts"
    shared_text = shared.read_text(encoding="utf-8") if shared.is_file() else ""
    if "jpLessonCourseMergeRefKey" not in shared_text:
        errors.append("missing jpLessonCourseMergeRefKey")
    if "course-" not in shared_text:
        errors.append("course merge ref_key must use course- prefix")

    route = ROOT / "src/app/api/jp-lesson/course-merge-ref/route.ts"
    route_text = route.read_text(encoding="utf-8") if route.is_file() else ""
    if not route.is_file():
        errors.append("missing course-merge-ref/route.ts")
    if "requireJpLessonOperate" not in route_text:
        errors.append("course-merge-ref must requireJpLessonOperate")
    if "jpLessonCourseMergeRefKey" not in route_text:
        errors.append("course-merge-ref must use jpLessonCourseMergeRefKey")
    if "putJpVocabRefFile" not in route_text or "saveJpVocabRefFileMeta" not in route_text:
        errors.append("course-merge-ref must save PDF to R2/meta")
    if "ref_view_path" not in route_text:
        errors.append("course-merge-ref must return ref_view_path")

    cell = ROOT / "src/components/jp-lesson-page/JpLessonCourseMergeCell.tsx"
    cell_text = cell.read_text(encoding="utf-8") if cell.is_file() else ""
    if "复制整课" not in cell_text:
        errors.append("JpLessonCourseMergeCell must show 复制整课")
    if "JpVocabSaveProgressBar" not in cell_text:
        errors.append("merge cell must use JpVocabSaveProgressBar")

    table = ROOT / "src/components/jp-lesson-page/JpLessonStatusTable.tsx"
    table_text = table.read_text(encoding="utf-8") if table.is_file() else ""
    if "planJpLessonCourseColumns" not in table_text:
        errors.append("StatusTable must plan course columns by course_group_id")
    if "JpLessonCourseMergeCell" not in table_text:
        errors.append("StatusTable must render JpLessonCourseMergeCell")
    if "rowSpan" not in table_text and "rowspan" not in table_text:
        errors.append("StatusTable should rowspan merged course cells")

    hook = ROOT / "src/components/jp-lesson-page/useJpLessonCourseMergeCopy.ts"
    hook_text = hook.read_text(encoding="utf-8") if hook.is_file() else ""
    if "/api/jp-lesson/course-merge-ref" not in hook_text:
        errors.append("merge hook must POST course-merge-ref")
    if "copyTextToClipboard" not in hook_text:
        errors.append("merge hook must copyTextToClipboard")
    if "整课合并需要两侧都有教案图" not in hook_text:
        errors.append("merge hook must toast when either side lacks image")

    page = ROOT / "src/components/JpLessonPage.tsx"
    page_text = page.read_text(encoding="utf-8") if page.is_file() else ""
    if "CopyToast" not in page_text:
        errors.append("JpLessonPage must mount CopyToast for course merge")
    if "useJpLessonCourseMergeCopy" not in page_text:
        errors.append("JpLessonPage must wire useJpLessonCourseMergeCopy")

    copy_menu = ROOT / "src/components/JpLessonCopyMenu.tsx"
    # sanity: still exists; behavior unchanged is covered by not requiring course merge there
    if not copy_menu.is_file():
        errors.append("JpLessonCopyMenu must remain (row copy unchanged)")

    docs = ROOT / "docs/jp-lesson-upload-mixed-api.txt"
    if docs.is_file():
        doc_text = docs.read_text(encoding="utf-8")
        if "复制整课" not in doc_text and "course-merge-ref" not in doc_text:
            errors.append(
                "docs/jp-lesson-upload-mixed-api.txt must mention 复制整课 / course-merge-ref"
            )
    else:
        errors.append("missing docs/jp-lesson-upload-mixed-api.txt")

    api_doc = ROOT / "docs/jp-lesson-course-merge-ref-api.txt"
    if not api_doc.is_file():
        errors.append("missing docs/jp-lesson-course-merge-ref-api.txt")
    else:
        api_text = api_doc.read_text(encoding="utf-8")
        if "/api/jp-lesson/course-merge-ref" not in api_text:
            errors.append("course-merge-ref API txt must document the path")

    rule = ROOT / ".cursor/rules/jp-lesson-course-merge-copy.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/jp-lesson-course-merge-copy.mdc")

    if errors:
        print("check_jp_lesson_course_merge_copy FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_jp_lesson_course_merge_copy OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
