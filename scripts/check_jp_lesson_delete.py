#!/usr/bin/env python3
"""回归：日语新课须有删除（二次确认 + API delete + DB deleteJpLesson）。"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needle: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        raise SystemExit(f"MISSING in {path.relative_to(ROOT)}: {needle!r}")


def main() -> int:
    must_contain(ROOT / "src/lib/jp-lesson-db-delete.ts", "export async function deleteJpLesson")
    must_contain(ROOT / "src/app/api/jp-lesson/route.ts", 'body.action === "delete"')
    must_contain(
        ROOT / "src/components/jp-lesson-page/useJpLessonPageActions.ts",
        "window.confirm(",
    )
    must_contain(
        ROOT / "src/components/jp-lesson-page/useJpLessonPageActions.ts",
        'action: "delete"',
    )
    must_contain(
        ROOT / "src/components/jp-lesson-page/JpLessonStatusTable.tsx",
        "jp-lesson-action-btn--danger",
    )
    must_contain(
        ROOT / "src/components/jp-lesson-page/JpLessonStatusTable.tsx",
        "onDeleteLesson",
    )
    print("ok: jp-lesson delete wired")
    return 0


if __name__ == "__main__":
    sys.exit(main())
