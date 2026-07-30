#!/usr/bin/env python3
"""Regression: en-vocab fill list_missing must prioritize today's daily_seq (序号)."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> int:
    errors: list[str] = []

    priority = read("src/lib/en-vocab-fill-daily-priority.ts")
    if "sortEnVocabFillRowsByDailyOrder" not in priority:
        errors.append("missing sortEnVocabFillRowsByDailyOrder helper")
    if "daily_seq" not in priority:
        errors.append("helper must attach daily_seq")

    settings = read("src/lib/en-vocab-db/daily_settings.ts")
    if "peekEnVocabDailyDisplayOrderIds" not in settings:
        errors.append("must export peekEnVocabDailyDisplayOrderIds (read-only)")

    for rel in (
        "src/lib/en-vocab-fill-reading.ts",
        "src/lib/en-vocab-fill-meaning.ts",
        "src/lib/en-vocab-fill-usage.ts",
        "src/lib/en-vocab-fill-example-sentences.ts",
    ):
        text = read(rel)
        if "sortEnVocabFillRowsByDailyOrder" not in text:
            errors.append(f"{rel}: must sort missing by daily order")
        if "peekEnVocabDailyDisplayOrderIds" not in text:
            errors.append(f"{rel}: must peek daily order ids")
        # list_missing must not apply SQL ORDER BY id LIMIT (misses high-id early-seq)
        if "listEnVocabWordsMissing" in text or "listEnVocabWordsMissingMeaningOrPos" in text:
            # Allow ORDER BY id only outside the list_missing path (e.g. clear_invalid)
            pass

    reading = read("src/lib/en-vocab-fill-reading.ts")
    chunk = reading.split("listEnVocabWordsMissingReading")[1].split(
        "scanEnVocabWordsMissingReading"
    )[0]
    # Strip line comments so explanatory notes don't false-positive
    code_only = "\n".join(
        ln for ln in chunk.splitlines() if not ln.lstrip().startswith("//")
    )
    if "ORDER BY id" in code_only:
        errors.append("fill-reading list_missing still ORDER BY id")

    meaning = read("src/lib/en-vocab-fill-meaning.ts")
    chunk = meaning.split("listEnVocabWordsMissingMeaningOrPos")[1].split(
        "scanEnVocabWordsMissingMeaning"
    )[0]
    code_only = "\n".join(
        ln for ln in chunk.splitlines() if not ln.lstrip().startswith("//")
    )
    if "ORDER BY id" in code_only:
        errors.append("fill-meaning list_missing still ORDER BY id")

    usage = read("src/lib/en-vocab-fill-usage.ts")
    chunk = usage.split("listEnVocabWordsMissingUsage")[1].split(
        "scanEnVocabWordsMissingUsage"
    )[0]
    code_only = "\n".join(
        ln for ln in chunk.splitlines() if not ln.lstrip().startswith("//")
    )
    if "ORDER BY id" in code_only:
        errors.append("fill-usage list_missing still ORDER BY id")

    examples = read("src/lib/en-vocab-fill-example-sentences.ts")
    chunk = examples.split("listEnVocabWordsMissingExampleSentences")[1].split(
        "scanEnVocabWordsMissingExampleSentences"
    )[0]
    code_only = "\n".join(
        ln for ln in chunk.splitlines() if not ln.lstrip().startswith("//")
    )
    if "ORDER BY id" in code_only:
        errors.append("fill-example-sentences list_missing still ORDER BY id")

    batch = read("scripts/en-vocab-fill-online-batch-api.py")
    if "daily_seq" not in batch:
        errors.append("online-batch must sort/merge by daily_seq")
    if 'rows.sort(key=lambda r: int(r.get("id") or 0))' in batch:
        errors.append("online-batch must not re-sort candidates by id only")

    rule = read(".cursor/rules/en-vocab-fill.mdc")
    if "当日序号优先" not in rule and "daily_seq" not in rule:
        errors.append("en-vocab-fill.mdc must document daily-seq priority")

    if errors:
        print("check_en_vocab_fill_daily_priority FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_en_vocab_fill_daily_priority: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
