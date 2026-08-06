#!/usr/bin/env python3
"""Regression: 接序「动词原形／动词た形／动词ている形＋X」不得被 strip 拆丢。

根因：旧 strip 按 ／ 切开后只保留带「＋」的段 → 原形／た形被吃掉，卡片只剩ている形。
对照 src/lib/jp-vocab-connection-ai.ts。
不调模型。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONN_AI = ROOT / "src/lib/jp-vocab-connection-ai.ts"
BODY = ROOT / "src/components/JpVocabConnectionBody.tsx"
RULE_QUALITY = ROOT / ".cursor/rules/jp-vocab-content-quality-guard.mdc"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    src = CONN_AI.read_text(encoding="utf-8")
    body = BODY.read_text(encoding="utf-8")
    rule = RULE_QUALITY.read_text(encoding="utf-8") if RULE_QUALITY.is_file() else ""

    for needle in (
        "splitJpVocabConnectionSlashOutsideParens",
        "rejoinJpVocabConnectionMorphologySlashChunks",
        "splitJpVocabConnectionTableNote",
    ):
        if needle not in src:
            fail(f"missing helper {needle} in jp-vocab-connection-ai.ts")

    # 禁止回到「整行无脑 split(/／/)」且不做 rejoin
    if re.search(
        r"trimmed\.split\(/\[／/\]/u\)|line\.split\(/\[／/\]/u\)",
        src,
    ):
        fail("raw split on ／ without outside-parens helper returned")

    if "rejoinJpVocabConnectionMorphologySlashChunks" not in src[
        src.find("stripJpVocabConnectionUsageNoise") : src.find(
            "stripJpVocabConnectionUsageNoise"
        )
        + 800
    ]:
        fail("stripJpVocabConnectionUsageNoise must rejoin morphology slash chunks")

    if "说明" not in body:
        fail("JpVocabConnectionBody must include 说明 column")
    if "showNoteCol" in body:
        fail("JpVocabConnectionBody must always show 说明（禁止 showNoteCol 条件隐藏）")

    if "词类／形态" not in body or "＋接什么" not in body:
        fail("JpVocabConnectionBody headers must be 词类／形态 + ＋接什么 + 说明")

    if "｜" not in src or "CONNECTION_TABLE_NOTE_SEP_RE" not in src:
        fail("connection table note separator ｜ missing")

    # 规则须记下本坑，避免只修库
    if "动词原形／动词た形" not in rule and "slash_morphology" not in rule:
        fail("content-quality rule must mention ／ morphology strip pitfall")

    # 优先示例须每形自带「＋」，不要只教「A／B／C＋X」
    if "动词辞书形（动词原形）＋X；动词た形＋X；动词ている形＋X" not in src:
        fail("prompt must prefer per-form ＋ formulas over A／B／C＋X")

    # 标准标本：jp_vocab_word id=521「～かもしれない」（词类／形态＋接什么｜说明）
    if "＋かもしれない｜推测将要发生" not in src:
        fail("prompt/upload_spec must use id=521 ～かもしれない as connection format exemplar")
    if "id=521" not in src:
        fail("connection-ai must cite specimen word id=521")

    if "protectNoteSlash" not in src:
        fail("slash split must protect ／ inside ｜说明 notes")

    diversity = (ROOT / "src/lib/jp-vocab-connection-note-diversity.ts").read_text(encoding="utf-8")
    if "connectionHasRepeatedIdenticalNotes" not in diversity:
        fail("missing connectionHasRepeatedIdenticalNotes")
    if "connectionHasMissingTableNotes" not in diversity:
        fail("missing connectionHasMissingTableNotes")
    if "repeated_identical_notes" not in src:
        fail("validate must reject repeated_identical_notes")
    if "missing_table_notes" not in src:
        fail("validate must reject missing_table_notes")
    expand = (ROOT / "src/lib/jp-vocab-connection-table-expand.ts").read_text(
        encoding="utf-8"
    )
    if "splitConnectionPlusOutsideParens" not in expand:
        fail("missing splitConnectionPlusOutsideParens")
    if "expandConnectionTableLabelSlash" not in expand:
        fail("missing expandConnectionTableLabelSlash")
    if "messy_paren_plus_slash" not in src:
        fail("validate must reject messy_paren_plus_slash")

    print("ok: connection slash-morphology + id=521 かもしれない specimen guards")


if __name__ == "__main__":
    main()
