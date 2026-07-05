#!/usr/bin/env python3
"""Clone Japanese learning module files to English equivalents."""
from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# (source relative to ROOT, dest relative to ROOT) — directories copied recursively
DIR_COPIES = [
    ("src/app/jp-vocab", "src/app/en-vocab"),
    ("src/app/jp-lesson", "src/app/en-lesson"),
    ("src/app/api/jp-vocab", "src/app/api/en-vocab"),
    ("src/app/api/jp-lesson", "src/app/api/en-lesson"),
    ("src/app/api/admin/jp-lesson-teachers", "src/app/api/admin/en-lesson-teachers"),
    ("src/app/api/admin/jp-lesson-teacher-review", "src/app/api/admin/en-lesson-teacher-review"),
    ("src/app/admin/jp-lesson-teachers", "src/app/admin/en-lesson-teachers"),
    ("src/app/zh/admin/jp-lesson-teachers", "src/app/zh/admin/en-lesson-teachers"),
]

# lib files: jp-foo.ts -> en-foo.ts
LIB_FILES = [
    "jp-api-cache.ts",
    "jp-lesson-class-schedule-db.ts",
    "jp-lesson-db.ts",
    "jp-lesson-note-db.ts",
    "jp-lesson-shared.ts",
    "jp-lesson-teacher-db.ts",
    "jp-lesson-teacher-review-db.ts",
    "jp-vocab-auth.ts",
    "jp-vocab-class-notes.ts",
    "jp-vocab-daily-check.ts",
    "jp-vocab-daily-order.ts",
    "jp-vocab-daily-quiz-style.ts",
    "jp-vocab-db.ts",
    "jp-vocab-export.ts",
    "jp-vocab-optimistic-save.ts",
    "jp-vocab-ref-pdf-export.ts",
    "jp-vocab-ref-server.ts",
    "jp-vocab-ref-shared.ts",
    "jp-vocab-review.ts",
    "jp-vocab-risk.ts",
    "jp-vocab-search.ts",
    "jp-vocab-shared-notify.ts",
    "jp-vocab-shared.ts",
    "jp-vocab-sync.ts",
]

# components: JpFoo.tsx -> EnFoo.tsx, AdminJpFoo -> AdminEnFoo
COMPONENT_FILES = [
    "AdminJpLessonTeachersPage.tsx",
    "JpClassNotesCell.tsx",
    "JpClassNotesEditModal.tsx",
    "JpEditIconButton.tsx",
    "JpLessonAnnotateModal.tsx",
    "JpLessonHalfHourTimeGridPicker.tsx",
    "JpLessonNextClassEditModal.tsx",
    "JpLessonNotesPage.tsx",
    "JpLessonPage.tsx",
    "JpLessonSchedulePage.tsx",
    "JpLessonTeacherEditModal.tsx",
    "JpLessonTeacherReviewModal.tsx",
    "JpVocabDailyQuizIntroModal.tsx",
    "JpVocabEditModal.tsx",
    "JpVocabFieldEditModal.tsx",
    "JpVocabManualAddModal.tsx",
    "JpVocabPage.tsx",
    "JpVocabRefDownloadMenu.tsx",
    "JpVocabRefEditModal.tsx",
    "JpVocabRefPreviewModal.tsx",
    "JpVocabRefViewer.tsx",
    "JpVocabRemarksViewModal.tsx",
    "JpVocabResetChoiceModal.tsx",
    "JpVocabRiskChart.tsx",
    "JpVocabRiskChartModal.tsx",
    "JpVocabStudyPage.tsx",
    "JpVocabTeacherRouteGuard.tsx",
]

REPLACEMENTS = [
    ("AdminJpLesson", "AdminEnLesson"),
    ("AdminJp", "AdminEn"),
    ("JpVocab", "EnVocab"),
    ("JpLesson", "EnLesson"),
    ("JpClass", "EnClass"),
    ("JpEdit", "EnEdit"),
    ("operate_jp_vocab", "operate_en_vocab"),
    ("canUserOperateJpVocab", "canUserOperateEnVocab"),
    ("canAccessJpVocabStudy", "canAccessEnVocabStudy"),
    ("canAccessJpVocab", "canAccessEnVocab"),
    ("isJpVocabTeacherRole", "isEnVocabTeacherRole"),
    ("isJpVocabTeacherAllowedPath", "isEnVocabTeacherAllowedPath"),
    ("isJpVocabTeacher", "isEnVocabTeacher"),
    ("isJpModulePath", "isEnModulePath"),
    ("isJpVocabRefPath", "isEnVocabRefPath"),
    ("isJpVocabStudyPath", "isEnVocabStudyPath"),
    ("isJpVocabPath", "isEnVocabPath"),
    ("isJpLessonPath", "isEnLessonPath"),
    ("isAdminJpLessonTeachersPath", "isAdminEnLessonTeachersPath"),
    ("adminJpLessonTeachersPath", "adminEnLessonTeachersPath"),
    ("jpVocabStudyPath", "enVocabStudyPath"),
    ("jpVocabPath", "enVocabPath"),
    ("jpLessonSchedulePath", "enLessonSchedulePath"),
    ("jpLessonPath", "enLessonPath"),
    ("nav:jp_teacher", "nav:en_teacher"),
    ("jp_learning", "en_learning"),
    ("jp_vocab:", "en_vocab:"),
    ("jp_lesson:", "en_lesson:"),
    ("jp_vocab", "en_vocab"),
    ("jp_lesson", "en_lesson"),
    ("jp-vocab-shared", "en-vocab-shared"),
    ("jp-vocab", "en-vocab"),
    ("jp-lesson", "en-lesson"),
    ("jp-api:", "en-api:"),
    ("ETR_JP_VOCAB", "ETR_EN_VOCAB"),
    ("ETR_JP_", "ETR_EN_"),
    ("idx_jp_", "idx_en_"),
    ("jpVocab", "enVocab"),
    ("jpLesson", "enLesson"),
    ("requireJp", "requireEn"),
    ("enableJp", "enableEn"),
    ("mergeJp", "mergeEn"),
    ("notifyJp", "notifyEn"),
    # Chinese UI strings in cloned pages
    ("日语单词 / 语法抽问", "英语单词 / 语法抽问"),
    ("日语单词", "英语单词"),
    ("日语新课", "英语新课"),
    ("今日背单词", "今日背英语单词"),
    ("日语抽问", "英语抽问"),
    ("日语学习", "英语学习"),
    ("日语教师", "英语教师"),
    ("日语模块", "英语模块"),
    ("日语", "英语"),
    # R2 prefix
    ('"jp/', '"en/'),
    ("'jp/", "'en/"),
    ("jp/refs/", "en/refs/"),
]

ZH_REPLACEMENTS = [
    ("日语上课老师", "英语上课老师"),
]


def transform_content(text: str, extra: list[tuple[str, str]] | None = None) -> str:
    for old, new in REPLACEMENTS + (extra or []):
        text = text.replace(old, new)
    return text


def dest_path_from_src(src: Path) -> Path:
    rel = str(src.relative_to(ROOT))
    rel = rel.replace("jp-vocab", "en-vocab")
    rel = rel.replace("jp-lesson", "en-lesson")
    rel = rel.replace("/jp-", "/en-")
    if "/components/" in rel:
        rel = rel.replace("AdminJp", "AdminEn").replace("Jp", "En")
    if "/lib/" in rel and rel.endswith(".ts"):
        name = Path(rel).name
        if name.startswith("jp-"):
            rel = str(Path(rel).with_name("en-" + name[3:]))
    return ROOT / rel


def copy_tree(src_dir: Path, dest_dir: Path) -> int:
    count = 0
    for src in src_dir.rglob("*"):
        if not src.is_file():
            continue
        rel = src.relative_to(src_dir)
        dest = dest_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        content = src.read_text(encoding="utf-8")
        content = transform_content(content)
        dest.write_text(content, encoding="utf-8")
        count += 1
    return count


def main() -> None:
    total = 0

    for src_rel, dest_rel in DIR_COPIES:
        src = ROOT / src_rel
        dest = ROOT / dest_rel
        if not src.exists():
            print(f"SKIP missing dir: {src_rel}")
            continue
        if dest.exists():
            shutil.rmtree(dest)
        n = copy_tree(src, dest)
        print(f"Copied {n} files: {src_rel} -> {dest_rel}")
        total += n

    lib_dir = ROOT / "src/lib"
    for name in LIB_FILES:
        src = lib_dir / name
        if not src.exists():
            print(f"SKIP missing lib: {name}")
            continue
        dest_name = "en-" + name[3:]
        dest = lib_dir / dest_name
        content = transform_content(src.read_text(encoding="utf-8"))
        dest.write_text(content, encoding="utf-8")
        print(f"Copied lib: {name} -> {dest_name}")
        total += 1

    comp_dir = ROOT / "src/components"
    for name in COMPONENT_FILES:
        src = comp_dir / name
        if not src.exists():
            print(f"SKIP missing component: {name}")
            continue
        dest_name = name.replace("AdminJp", "AdminEn").replace("Jp", "En")
        dest = comp_dir / dest_name
        extra = ZH_REPLACEMENTS if "Admin" in name or "Lesson" in name else None
        content = transform_content(src.read_text(encoding="utf-8"), extra)
        dest.write_text(content, encoding="utf-8")
        print(f"Copied component: {name} -> {dest_name}")
        total += 1

    print(f"\nDone. Total files: {total}")


if __name__ == "__main__":
    main()
