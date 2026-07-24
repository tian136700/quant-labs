#!/usr/bin/env python3
"""Regression: en-vocab admin daily quiz target wiring."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read_en_vocab_db() -> str:
    db = ROOT / "src/lib/en-vocab-db.ts"
    parts = [db.read_text(encoding="utf-8")] if db.is_file() else []
    db_dir = ROOT / "src/lib/en-vocab-db"
    if db_dir.is_dir():
        for p in sorted(db_dir.glob("*.ts")):
            parts.append(p.read_text(encoding="utf-8"))
    return "\n".join(parts)


def read_page_bundle() -> str:
    """Page + en-vocab-page/ + admin actions hook (set_daily_quiz_target lives in hook)."""
    parts = [(ROOT / "src/components/EnVocabPage.tsx").read_text(encoding="utf-8")]
    page_dir = ROOT / "src/components/en-vocab-page"
    if page_dir.is_dir():
        for f in sorted(page_dir.glob("*.tsx")):
            parts.append(f.read_text(encoding="utf-8"))
    hook = ROOT / "src/hooks/useEnVocabAdminActions.ts"
    if hook.is_file():
        parts.append(hook.read_text(encoding="utf-8"))
    return "\n".join(parts)


def must_contain_text(text: str, needles: list[str], label: str) -> list[str]:
    return [f"{label}: missing {n!r}" for n in needles if n not in text]


def must_contain(path: pathlib.Path, needles: list[str]) -> list[str]:
    if path.name == "en-vocab-db.ts":
        text = read_en_vocab_db()
    else:
        text = path.read_text(encoding="utf-8")
    return [n for n in needles if n not in text]


def main() -> int:
    errors: list[str] = []

    checks: list[tuple[pathlib.Path, list[str]]] = [
        (
            ROOT / "src/lib/en-vocab-teacher-visible.ts",
            [
                "export type EnVocabTeacherVisibleLimit",
                "export function normalizeEnVocabTeacherVisibleLimit",
                "export function materializeEnVocabTeacherVisible",
                "export function isEnVocabWordInTeacherVisiblePool",
                "EN_VOCAB_TEACHER_VISIBLE_DEFAULT",
            ],
        ),
        (
            ROOT / "src/lib/en-vocab-db.ts",
            [
                "export async function getEnVocabTeacherVisibleLimit",
                "export async function ensureEnVocabTeacherVisibleLimit",
                "export async function setEnVocabDailyQuizTarget",
                'EN_VOCAB_TEACHER_VISIBLE_LIMIT_KEY = "teacher_visible_limit"',
            ],
        ),
        (
            ROOT / "src/app/api/en-vocab/route.ts",
            [
                'body.action === "set_daily_quiz_target"',
                "setEnVocabDailyQuizTarget",
                "ensureEnVocabTeacherVisibleLimit",
                "teacher_visible_limit",
            ],
        ),
        (
            ROOT / "src/app/api/en-vocab/sync/route.ts",
            [
                "getEnVocabTeacherVisibleLimit",
                "bypassCache: true",
                "teacher_visible_limit",
            ],
        ),
        (
            ROOT / "src/lib/en-api-cache.ts",
            [
                "teacher_visible_limit: EnVocabTeacherVisibleLimit",
                "normalizeEnVocabTeacherVisibleLimit",
            ],
        ),
        (
            ROOT / ".cursor/rules/en-vocab-admin-teacher-split.mdc",
            [
                "设今日抽查数量",
                "setEnVocabDailyQuizTarget",
            ],
        ),
    ]

    for path, needles in checks:
        if not path.is_file():
            errors.append(f"missing {path.relative_to(ROOT)}")
            continue
        for n in must_contain(path, needles):
            errors.append(f"{path.relative_to(ROOT)}: missing {n!r}")

    page_bundle = read_page_bundle()
    errors.extend(
        must_contain_text(
            page_bundle,
            [
                "adminQuizTarget=",
                "setDailyQuizTarget",
                "teacherVisibleLimit",
                'action: "set_daily_quiz_target"',
                "isEnVocabWordInTeacherVisiblePool",
            ],
            "EnVocabPage(+hooks)",
        )
    )

    # Admin-only: adminQuizTarget must be gated by isAdminMode
    page = ROOT / "src/components/EnVocabPage.tsx"
    if page.is_file():
        text = page.read_text(encoding="utf-8")
        if "adminQuizTarget={" not in text or "isAdminMode" not in text:
            errors.append("EnVocabPage must gate adminQuizTarget with isAdminMode")
        # Must not hardcode quizTarget solely from EN_VOCAB_DAILY_QUIZ_TOP
        if "quizTarget = Math.min(EN_VOCAB_DAILY_QUIZ_TOP" in text:
            errors.append(
                "EnVocabPage must read quizTarget from teacherVisibleLimit, not hardcode EN_VOCAB_DAILY_QUIZ_TOP"
            )

    if errors:
        print("check_en_vocab_daily_quiz_target FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_en_vocab_daily_quiz_target OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
