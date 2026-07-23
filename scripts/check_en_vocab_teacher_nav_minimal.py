#!/usr/bin/env python3
"""Regression: English teacher nav must stay minimal (quiz only)."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    nav = read("src/hooks/useSiteNavItems.ts")
    # Extract enTeacherNav block
    m = re.search(
        r"if \(enTeacherNav\) \{[\s\S]*?return \[([\s\S]*?)\];\s*\}",
        nav,
    )
    if not m:
        fail("enTeacherNav return block not found in useSiteNavItems.ts")
    block = m.group(1)
    for forbidden in ("enVocabStudy", "enLesson", "aboutNavItem", 'id: "about"'):
        if forbidden in block:
            fail(f"enTeacherNav must not include {forbidden!r}")
    if "enVocab" not in block:
        fail("enTeacherNav must include enVocab")

    etr = read("src/lib/etr-auth.ts")
    if "canUserOperateEnVocab(user)" in etr.split("canAccessEnVocabStudy")[1].split(
        "canAccessEnVocabTeacherPage"
    )[0] and "return canUserOperateEnVocab" in etr:
        # Ensure study is NOT simply alias of operate
        study_fn = etr.split("export function canAccessEnVocabStudy")[1].split(
            "export function canAccessEnVocabTeacherPage"
        )[0]
        if re.search(r"return\s+canUserOperateEnVocab\s*\(", study_fn):
            fail("canAccessEnVocabStudy must not return canUserOperateEnVocab(user)")

    auth = read("src/lib/en-vocab-auth.ts")
    lesson_fn = auth.split("export async function requireEnLessonOperate")[1]
    if "canUserOperateEnVocab" in lesson_fn.split("export ")[0] if "export " in lesson_fn else lesson_fn:
        # only look inside the function body until next export or EOF
        body = re.split(r"\nexport ", lesson_fn, maxsplit=1)[0]
        if "canUserOperateEnVocab" in body:
            fail("requireEnLessonOperate must not fall back to canUserOperateEnVocab")

    print("OK: en teacher nav minimal + study/lesson access guards")


if __name__ == "__main__":
    main()
