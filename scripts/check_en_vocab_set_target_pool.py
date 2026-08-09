#!/usr/bin/env python3
"""Regression: en-vocab set-target / rematerialize 须用 WORD_SELECT_POOL（防 1102）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    helpers = (ROOT / "src/lib/en-vocab-db/helpers.ts").read_text(encoding="utf-8")
    pool = (ROOT / "src/lib/en-vocab-db/pool.ts").read_text(encoding="utf-8")
    daily = (ROOT / "src/lib/en-vocab-db/daily_settings.ts").read_text(
        encoding="utf-8"
    )
    words = (ROOT / "src/lib/en-vocab-db/words.ts").read_text(encoding="utf-8")
    index = (ROOT / "src/lib/en-vocab-db/index.ts").read_text(encoding="utf-8")

    if "WORD_SELECT_POOL" not in helpers:
        fail("helpers.ts must define WORD_SELECT_POOL")
    pool_decl = helpers.split("export const WORD_SELECT_POOL", 1)[1]
    if "`" not in pool_decl:
        fail("WORD_SELECT_POOL must be a template string")
    pool_sql = pool_decl.split("`", 2)[1]
    # last_usage_levels 含字面 "usage"，先剥掉再查大字段
    pool_sql_check = pool_sql.replace("last_usage_levels", "")
    for blob in (
        "class_notes",
        "mnemonic",
        "usage",
        "example_sentences",
        "connection",
    ):
        if blob in pool_sql_check:
            fail(f"WORD_SELECT_POOL must not SELECT {blob}")

    if "listEnVocabWordsForPool" not in pool:
        fail("pool.ts must export listEnVocabWordsForPool")
    if "WORD_SELECT_POOL" not in pool:
        fail("listEnVocabWordsForPool must use WORD_SELECT_POOL")

    if 'from "./pool"' not in index and "from './pool'" not in index:
        fail("en-vocab-db/index.ts must re-export pool")

    if "setEnVocabDailyQuizTarget" not in daily:
        fail("daily_settings must define setEnVocabDailyQuizTarget")
    target_fn = daily.split("export async function setEnVocabDailyQuizTarget", 1)[
        1
    ].split("export async function", 1)[0]
    if "listEnVocabWordsForPool" not in target_fn:
        fail("setEnVocabDailyQuizTarget must use listEnVocabWordsForPool")
    if "listEnVocabWords(" in target_fn or "listEnVocabWordsForClientList" in target_fn:
        fail("setEnVocabDailyQuizTarget must not use heavy client list")

    ensure_fn = daily.split(
        "export async function ensureEnVocabTeacherVisibleLimit", 1
    )[1].split("export async function", 1)[0]
    if "listEnVocabWordsForPool" not in ensure_fn:
        fail("ensureEnVocabTeacherVisibleLimit fallback must use ForPool")

    for name in ("resetAllEnVocabReviews", "resetTodayEnVocabRound"):
        if name not in words:
            fail(f"words.ts missing {name}")
        body = words.split(f"export async function {name}", 1)[1].split(
            "export async function", 1
        )[0]
        if "listEnVocabWordsForPool" not in body:
            fail(f"{name} rematerialize must use listEnVocabWordsForPool")

    print("OK: en-vocab set-target / rematerialize use WORD_SELECT_POOL")


if __name__ == "__main__":
    main()
