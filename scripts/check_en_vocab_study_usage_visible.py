#!/usr/bin/env python3
"""回归：学生今日英语单词卡须能看到用法/例句（老师端有、学生端「暂无」曾复发）。

根因：shared 列表用 mapEnVocabListWordRow 剥掉 usage 正文，学生无 en_vocab:read，
按需 GET /api/en-vocab?word_id= 401 → 卡片空。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> int:
    errors: list[str] = []

    share = read("src/lib/en-vocab-db/share.ts")
    q = share.split("export async function queryEnVocabSharedToday", 1)
    if len(q) < 2:
        errors.append("queryEnVocabSharedToday missing")
    else:
        body = q[1].split("export async function ", 1)[0]
        if "mapEnVocabSharedStudyWordRow" not in body:
            errors.append(
                "queryEnVocabSharedToday must map with mapEnVocabSharedStudyWordRow "
                "(keep usage/examples body for study cards)"
            )
        if re.search(r"mapSharedListWordRow\s*\(", body) or re.search(
            r"mapEnVocabListWordRow\s*\(", body
        ):
            errors.append(
                "queryEnVocabSharedToday must not strip usage via list mapper "
                "(students cannot backfill via teacher-only GET)"
            )

    helpers = read("src/lib/en-vocab-db/helpers.ts")
    if "export function mapEnVocabSharedStudyWordRow" not in helpers:
        errors.append("helpers: missing mapEnVocabSharedStudyWordRow")
    else:
        fn = helpers.split("export function mapEnVocabSharedStudyWordRow", 1)[1]
        fn = fn.split("export function ", 1)[0]
        if "usage: null" in fn or "example_sentences: null" in fn:
            errors.append(
                "mapEnVocabSharedStudyWordRow must keep usage/example_sentences body"
            )
        if "class_notes: null" not in fn:
            errors.append(
                "mapEnVocabSharedStudyWordRow must still omit class_notes body"
            )

    route = read("src/app/api/en-vocab/route.ts")
    if "requireEnVocabStudyAccess" not in route:
        errors.append(
            "GET /api/en-vocab?word_id= must allow study access for shared/live words"
        )
    if "isEnVocabWordSharedToday" not in route or "getEnVocabTeacherQuizLive" not in route:
        errors.append(
            "GET word_id study fallback must gate on shared today or live word_id"
        )

    notes = read("src/app/api/en-vocab/class-notes/route.ts")
    if "requireEnVocabStudyAccess" not in notes:
        errors.append(
            "GET /api/en-vocab/class-notes must allow study for shared/live words"
        )

    rule = ROOT / ".cursor/rules/en-vocab-study-flashcard-parity.mdc"
    if rule.is_file():
        r = rule.read_text(encoding="utf-8")
        if "暂无用法" not in r and "mapEnVocabSharedStudyWordRow" not in r:
            errors.append(
                "en-vocab-study-flashcard-parity.mdc must document study usage visibility"
            )

    if errors:
        print("check_en_vocab_study_usage_visible: FAIL", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print("check_en_vocab_study_usage_visible: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
