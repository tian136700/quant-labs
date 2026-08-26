#!/usr/bin/env python3
"""Regression: English vocab/lesson category tag is wired end-to-end."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def must_contain(path: Path, needle: str, label: str | None = None) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        fail(f"{label or path.relative_to(ROOT)} missing {needle!r}")


def main() -> None:
    must_contain(
        ROOT / "src/lib/en-vocab-category.ts",
        'EN_VOCAB_DEFAULT_CATEGORY = "雅思托福"',
    )
    must_contain(
        ROOT / "schema.sql",
        "category    TEXT    NOT NULL DEFAULT '雅思托福'",
    )
    must_contain(ROOT / "src/lib/en-lesson-db.ts", "ensureEnLessonCategoryColumn")
    must_contain(ROOT / "src/lib/en-lesson-db.ts", "category: lesson.category")
    must_contain(
        ROOT / "src/lib/en-lesson-db.ts",
        "INSERT INTO en_lesson (kind, content, meanings, category, title, remarks, ref_key",
    )
    must_contain(
        ROOT / "src/lib/en-lesson-create-with-file.ts",
        "normalizeEnVocabCategory",
    )
    must_contain(
        ROOT / "src/lib/en-lesson-create-with-file.ts",
        "category",
    )
    must_contain(
        ROOT / "src/app/api/en-lesson/upload/route.ts",
        "createEnLessonWithOptionalFile",
    )
    must_contain(
        ROOT / "src/app/api/en-lesson/create/route.ts",
        "createEnLessonWithOptionalFile",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-db/words.ts",
        "category: normalizeEnVocabCategory(w.category)",
    )
    must_contain(
        ROOT / "src/app/api/en-vocab/edit/route.ts",
        "category: body.category",
    )
    must_contain(
        ROOT / "src/components/en-vocab-page/EnVocabWordTable.tsx",
        'sortKey="category"',
    )
    must_contain(
        ROOT / "src/components/EnVocabEditModal.tsx",
        "en-vocab-edit-category",
    )
    must_contain(
        ROOT / "src/components/en-lesson-page/EnLessonStatusTable.tsx",
        "en-lesson-category-col",
    )
    must_contain(
        ROOT / "src/components/en-lesson-page/EnLessonStatusTable.tsx",
        "shortEnVocabCategoryLabel",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-category.ts",
        "shortEnVocabCategoryLabel",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-category.ts",
        'return "托业"',
    )
    must_contain(
        ROOT / "src/lib/en-vocab-category.ts",
        'EN_VOCAB_IT_INTERVIEW_CATEGORY = "IT面试"',
    )
    must_contain(
        ROOT / "src/lib/en-vocab-category.ts",
        "IT面试类高频词汇",
    )
    # API「…错题分类」及类似名须归入标准托业 / 雅思托福（含关键字即归入）
    must_contain(
        ROOT / "src/lib/en-vocab-category.ts",
        "托业错题分类",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-category.ts",
        "雅思错题分类",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-category.ts",
        'if (t.includes("托业") || lower.includes("toeic")) return "托业"',
    )
    must_contain(
        ROOT / "src/lib/en-vocab-category.ts",
        't.includes("雅思")',
    )
    must_contain(
        ROOT / "src/lib/en-vocab-category.ts",
        't.includes("托福")',
    )
    # 抽查卡 / study 卡 / 复习卡须展示分类（托业、雅思托福…）
    must_contain(
        ROOT / "src/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardPageBody.tsx",
        "displayEnVocabCategory",
    )
    must_contain(
        ROOT / "src/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardPageBody.tsx",
        "en-vocab-flashcard-category",
    )
    must_contain(
        ROOT / "src/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardPageBody.tsx",
        "<dt>分类：</dt>",
    )
    must_contain(
        ROOT / "src/components/EnVocabFlashcardWordHero.tsx",
        "displayEnVocabCategory",
    )
    must_contain(
        ROOT / "src/components/EnVocabFlashcardWordHero.tsx",
        "en-vocab-flashcard-category",
    )
    must_contain(
        ROOT / "src/components/EnVocabAdminReviewFlashcardModal.tsx",
        "category={w.category}",
    )
    must_contain(
        ROOT / "src/components/JpVocabTeacherQuizFlashcardStyles.tsx",
        ".en-vocab-flashcard-category",
    )
    must_contain(
        ROOT / "scripts/en-vocab-fill-online-batch-api.py",
        "IT / 软件工程技术面试",
    )
    # iPad must keep category visible (two-char hint), not hide the column
    styles = (ROOT / "src/components/en-lesson-page/EnLessonPageStyles.tsx").read_text(
        encoding="utf-8"
    )
    tablet = styles.split("max-width: 1024px", 1)[-1] if "max-width: 1024px" in styles else ""
    if "en-lesson-category-col" in tablet and "display: none" in tablet.split("en-lesson-category-col", 1)[1][:120]:
        fail("EnLessonPageStyles tablet must NOT hide en-lesson-category-col")
    print("OK: en-vocab / en-lesson category wiring")


if __name__ == "__main__":
    main()
