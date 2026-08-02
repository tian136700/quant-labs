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

    if "说明" not in body or "showNoteCol" not in body:
        fail("JpVocabConnectionBody must support optional 说明 column")

    if "｜" not in src or "CONNECTION_TABLE_NOTE_SEP_RE" not in src:
        fail("connection table note separator ｜ missing")

    # 规则须记下本坑，避免只修库
    if "动词原形／动词た形" not in rule and "slash_morphology" not in rule:
        fail("content-quality rule must mention ／ morphology strip pitfall")

    # 优先示例须每形自带「＋」，不要只教「A／B／C＋X」
    if "动词辞书形（动词原形）＋X；动词た形＋X；动词ている形＋X" not in src:
        fail("prompt must prefer per-form ＋ formulas over A／B／C＋X")

    print("ok: connection slash-morphology + 说明 column guards")


if __name__ == "__main__":
    main()
