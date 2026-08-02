#!/usr/bin/env python3
"""回归：相关构词字段（口→入口）校验 / 卡片 / fill / schema。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needle: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        raise SystemExit(f"FAIL {label}: missing {needle!r} in {path.relative_to(ROOT)}")


def main() -> int:
    lib = ROOT / "src/lib/jp-vocab-related-compounds.ts"
    helpers = ROOT / "src/lib/jp-vocab-db/helpers.ts"
    share = ROOT / "src/lib/jp-vocab-db/share.ts"
    live = ROOT / "src/lib/jp-vocab-db/live_rollover.ts"
    fill = ROOT / "src/lib/jp-vocab-fill-example-sentences.ts"
    route = ROOT / "src/app/api/jp-vocab/fill-example-sentences/route.ts"
    section = ROOT / "src/components/JpVocabRelatedCompoundsSection.tsx"
    teacher = ROOT / "src/components/JpVocabTeacherQuizFlashcardModal.tsx"
    review = ROOT / "src/components/JpVocabAdminReviewFlashcardModal.tsx"
    online = ROOT / "scripts/jp-vocab-fill-online-batch-api.py"
    types = ROOT / "src/lib/types.ts"

    must_contain(lib, "JP_VOCAB_RELATED_COMPOUNDS_LABEL", "label")
    must_contain(lib, "相关构词", "zh label")
    must_contain(lib, "validateJpVocabRelatedCompoundsAiOutput", "validate")
    must_contain(lib, "入口", "入口 example")
    must_contain(lib, "いりぐち", "rendaku reading")
    must_contain(helpers, "related_compounds", "schema/select")
    must_contain(helpers, "related_compounds_source", "source col")
    must_contain(share, "w.related_compounds", "shared select")
    must_contain(live, "related_compounds", "peek select")
    must_contain(fill, "related_compounds", "fill apply")
    must_contain(fill, "markRelatedCompoundsCheckedEmpty", "empty checked")
    must_contain(route, "related_compounds", "api route")
    must_contain(route, "list_missing_related_compounds", "list missing mode")
    must_contain(
        ROOT / "src/lib/jp-vocab-related-compounds-fill.ts",
        "listJpVocabWordsMissingRelatedCompounds",
        "list helper",
    )
    must_contain(
        ROOT / "scripts/jp-vocab-fill-related-compounds-online-api.py",
        "list_missing_related_compounds",
        "temp online api",
    )
    must_contain(
        ROOT / "scripts/setup-jp-vocab-fill-related-compounds-online-mac.sh",
        "jp-vocab-fill-related-compounds-online",
        "setup mac",
    )
    must_contain(section, "JpVocabFuriganaText", "furigana display")
    must_contain(teacher, "JpVocabRelatedCompoundsSection", "teacher card")
    must_contain(review, "JpVocabRelatedCompoundsSection", "review card")
    must_contain(online, "related_compounds", "online batch")
    must_contain(online, "相关构词", "online prompt zh")
    must_contain(online, "禁止硬凑", "no forced compounds")
    must_contain(online, "同一次", "same request")
    must_contain(lib, "没有自然相关词", "empty ok hint")
    must_contain(lib, "最多 4～5", "max count hint")
    must_contain(types, "related_compounds?", "type field")

    # Pure-Python smoke for line parse
    import re

    line_re = re.compile(
        r"^([\u4E00-\u9FFF々〆ヶぁ-んァ-ンー]+)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]\s*[:：]\s*(.+)$"
    )
    ok = line_re.match("入口(いりぐち)：入口")
    bad = line_re.match("入口いりぐち")
    if not ok or bad:
        raise SystemExit("FAIL: line parse smoke")
    if ok.group(2) != "いりぐち":
        raise SystemExit("FAIL: reading extract")

    print("[check_jp_vocab_related_compounds] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
