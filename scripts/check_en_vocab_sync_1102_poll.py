#!/usr/bin/env python3
"""Regression: EN sync must follow JP 1102-safe pattern (limit=0 + light teacher-visible)."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> int:
    sync_hook = read("src/hooks/useEnVocabPageSync.ts")
    sync_api = read("src/app/api/en-vocab/sync/route.ts")
    words = read("src/lib/en-vocab-db/words.ts")
    light = ROOT / "src/app/api/en-vocab/teacher-visible/route.ts"
    errors: list[str] = []

    if not light.is_file():
        errors.append("missing /api/en-vocab/teacher-visible (align jp-vocab)")
    else:
        light_txt = light.read_text(encoding="utf-8")
        if "getEnVocabTeacherVisibleLimit" not in light_txt:
            errors.append("teacher-visible route must only read limit (light)")

    if "limit=0" not in sync_hook:
        errors.append("word sync poll must use limit=0 (skip teacher_visible every 5s)")
    if "/api/en-vocab/teacher-visible" not in sync_hook:
        errors.append("must poll light teacher-visible endpoint separately")
    if "EN_VOCAB_TEACHER_VISIBLE_POLL_MS" not in sync_hook:
        errors.append("must use EN_VOCAB_TEACHER_VISIBLE_POLL_MS for limit poll")

    # sync API still supports limit=0
    if 'get("limit") !== "0"' not in sync_api and 'get("limit") != "0"' not in sync_api:
        errors.append("sync route must honor limit=0")

    # hot path: no seedIfEmpty in changedSince
    idx = words.find("listEnVocabWordsChangedSince")
    if idx < 0:
        errors.append("missing listEnVocabWordsChangedSince")
    else:
        chunk = words[idx : idx + 800]
        if "seedIfEmpty" in chunk:
            errors.append("listEnVocabWordsChangedSince must not call seedIfEmpty (JP已去掉)")

    if errors:
        print("FAIL:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("ok: en-vocab sync aligns JP 1102-safe poll split")
    return 0


if __name__ == "__main__":
    sys.exit(main())
