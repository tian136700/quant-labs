"""Regression: 用法卡片须抽出 JLPT 并展示徽章；接续表始终含说明列。"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> int:
    print(f"[check_jp_vocab_usage_jlpt_badge] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    ai = (ROOT / "src/lib/jp-vocab-usage-ai.ts").read_text(encoding="utf-8")
    paired = (
        ROOT / "src/components/JpVocabUsageExamplesPairedContent.tsx"
    ).read_text(encoding="utf-8")
    body = (ROOT / "src/components/JpVocabConnectionBody.tsx").read_text(
        encoding="utf-8"
    )

    if "extractJpVocabUsageJlptForDisplay" not in ai:
        return fail("missing extractJpVocabUsageJlptForDisplay")
    if "extractJpVocabUsageJlptForDisplay" not in paired:
        return fail("paired content must use extractJpVocabUsageJlptForDisplay")
    if "jp-usage-ex-paired-jlpt" not in paired:
        return fail("paired content must render jlpt badge class")
    if "showNoteCol" in body:
        return fail("connection body must not conditionally hide 说明 via showNoteCol")
    if body.count(">说明<") < 1 and "说明</th>" not in body:
        return fail("connection body must always render 说明 header")

    print("[check_jp_vocab_usage_jlpt_badge] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
