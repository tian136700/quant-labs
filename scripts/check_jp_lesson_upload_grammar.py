#!/usr/bin/env python3
"""Regression: dedicated grammar upload + completed→quiz sync wiring."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needle: str, label: str, errors: list[str]) -> None:
    if not path.is_file():
        errors.append(f"missing {label}: {path}")
        return
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        errors.append(f"{label} must contain {needle!r}")


def main() -> int:
    errors: list[str] = []
    route = ROOT / "src/app/api/jp-lesson/upload-grammar/route.ts"
    must_contain(route, 'kind: "grammar"', "upload-grammar route", errors)
    must_contain(
        route,
        "createOrUpsertJpLessonByCourseLabel",
        "upload-grammar upsert",
        errors,
    )
    must_contain(route, "annotations", "upload-grammar route", errors)
    must_contain(route, "mark_completed_to_sync_quiz", "upload-grammar hint", errors)
    must_contain(route, "upserted", "upload-grammar upserted field", errors)

    upsert = ROOT / "src/lib/jp-lesson-db-upsert.ts"
    must_contain(
        upsert,
        "findPendingJpLessonsByCourseLabelKind",
        "upsert find pending",
        errors,
    )
    must_contain(
        upsert,
        "createOrUpsertJpLessonByCourseLabel",
        "upsert entry",
        errors,
    )

    upload = ROOT / "src/app/api/jp-lesson/upload/route.ts"
    must_contain(upload, 'form.get("kind") === "grammar"', "legacy upload", errors)
    must_contain(upload, "annotations", "legacy upload annotations", errors)
    must_contain(
        upload,
        "createOrUpsertJpLessonByCourseLabel",
        "legacy upload upsert",
        errors,
    )

    sync = ROOT / "src/lib/jp-lesson-vocab-sync.ts"
    must_contain(sync, "upsertJpVocabFromLesson", "vocab sync", errors)
    must_contain(sync, "kind === \"grammar\"", "vocab sync grammar meaning", errors)

    actions = ROOT / "src/components/jp-lesson-page/useJpLessonPageActions.ts"
    must_contain(actions, "syncLessonVocabIfNeeded", "UI completed sync", errors)
    must_contain(actions, 'progressStatus === "completed"', "UI completed branch", errors)

    docs = ROOT / "docs/jp-lesson-upload-grammar-api.txt"
    must_contain(docs, "/api/jp-lesson/upload-grammar", "docs", errors)
    must_contain(docs, "已完成", "docs completed", errors)

    if errors:
        print("FAIL")
        for e in errors:
            print(" -", e)
        return 1
    print("OK jp-lesson upload-grammar + completed sync wiring")
    return 0


if __name__ == "__main__":
    sys.exit(main())
