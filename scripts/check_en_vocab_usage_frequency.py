#!/usr/bin/env python3
"""Regression: English usage lines carry frequency [1]-[10]; flashcard shows 出现频次."""

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
    ai = read("src/lib/en-vocab-usage-ai.ts")
    if "EN_VOCAB_USAGE_FREQUENCY_PREFIX_RE" not in ai:
        fail("missing EN_VOCAB_USAGE_FREQUENCY_PREFIX_RE")
    if "extractEnVocabUsageFrequency" not in ai:
        fail("missing extractEnVocabUsageFrequency")
    if "formatEnVocabUsageFrequencyLabel" not in ai:
        fail("missing formatEnVocabUsageFrequencyLabel")
    if "missing_frequency" not in ai:
        fail("validate must reject missing_frequency")
    if "出现频次" not in ai:
        fail("prompt/label must mention 出现频次")
    if "[8]" not in ai and "[9]" not in ai:
        fail("format_example / prompt must show [score] sample")

    # format_example 须带分值、禁考试标签
    m = re.search(r'format_example:\s*\n?\s*"((?:\\.|[^"\\])*)"', ai)
    if not m:
        fail("format_example not found")
    format_example = bytes(m.group(1), "utf-8").decode("unicode_escape")
    if "[8]" not in format_example and "[5]" not in format_example:
        fail("format_example must include [score] markers")
    if re.search(r"雅思|托福|IELTS|TOEFL", format_example, re.I):
        fail("format_example must not contain exam labels")

    display = read("src/lib/en-vocab-usage-examples-display.ts")
    if "frequency" not in display:
        fail("paired display model must carry frequency")
    if "formatEnVocabUsageFrequencyLabel" not in display:
        fail("copy text must use formatEnVocabUsageFrequencyLabel")

    ui = read("src/components/EnVocabUsageExamplesPairedContent.tsx")
    if "en-usage-ex-paired-freq" not in ui:
        fail("flashcard UI must render frequency badge class")
    if "出现频次" not in ui and "formatEnVocabUsageFrequencyLabel" not in ui:
        fail("flashcard UI must show frequency label")

    py = read("scripts/en-vocab-fill-usage-api.py")
    if "missing_frequency" not in py:
        fail("Python fill-usage must reject missing_frequency")
    if "[9]" not in py and "[1-10" not in py:
        fail("Python fallback prompt must ask for [score]")

    online = read("scripts/en-vocab-fill-online-batch-api.py")
    if "normalize_usage" not in online:
        fail("online batch must normalize_usage (string or array)")
    if "frequency score" not in online.lower() and "[1]-[10]" not in online:
        fail("online SYSTEM/prompt must require frequency scores")

    edit = read("src/components/EnVocabEditModal.tsx")
    if "[8]" not in edit:
        fail("edit modal placeholder should show [score] sample")

    fill = read("src/lib/en-vocab-fill-usage.ts")
    if "enVocabUsageHasCompleteFrequency" not in fill:
        fail("fill-usage must use enVocabUsageHasCompleteFrequency")
    if "needs_frequency_only" not in fill:
        fail("list_missing must flag needs_frequency_only for backfill")
    if "buildEnVocabUsageFrequencyBackfillPrompt" not in fill:
        fail("list_missing must use frequency backfill prompt")
    if "missing_frequency" not in fill:
        fail("force apply must still reject missing_frequency")

    if "enVocabUsageHasCompleteFrequency" not in ai:
        fail("missing enVocabUsageHasCompleteFrequency helper")
    if "buildEnVocabUsageFrequencyBackfillPrompt" not in ai:
        fail("missing frequency backfill prompt builder")

    print("OK: en-vocab usage frequency score (1–10) wired end-to-end")


if __name__ == "__main__":
    main()
