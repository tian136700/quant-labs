#!/usr/bin/env python3
"""回归：相关构词字段（口→入口）校验 / 卡片 / fill / 同读 / 展示。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needle: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        raise SystemExit(f"FAIL {label}: missing {needle!r} in {path.relative_to(ROOT)}")


def main() -> int:
    lib = ROOT / "src/lib/jp-vocab-related-compounds.ts"
    section = ROOT / "src/components/JpVocabRelatedCompoundsSection.tsx"
    styles = ROOT / "src/components/JpVocabTeacherQuizFlashcardStyles.tsx"
    helpers = ROOT / "src/lib/jp-vocab-db/helpers.ts"
    share = ROOT / "src/lib/jp-vocab-db/share.ts"
    live = ROOT / "src/lib/jp-vocab-db/live_rollover.ts"
    fill = ROOT / "src/lib/jp-vocab-fill-example-sentences.ts"
    route = ROOT / "src/app/api/jp-vocab/fill-example-sentences/route.ts"
    teacher = ROOT / "src/components/JpVocabTeacherQuizFlashcardModal.tsx"
    review = ROOT / "src/components/JpVocabAdminReviewFlashcardModal.tsx"
    online = ROOT / "scripts/jp-vocab-fill-online-batch-api.py"
    types = ROOT / "src/lib/types.ts"
    ai = ROOT / "src/lib/jp-vocab-example-sentences-ai.ts"

    must_contain(lib, "JP_VOCAB_RELATED_COMPOUNDS_LABEL", "label")
    must_contain(lib, "相关构词", "zh label")
    must_contain(lib, "validateJpVocabRelatedCompoundsAiOutput", "validate")
    must_contain(lib, "compoundSharesLemmaSameReading", "same reading")
    must_contain(lib, "jpVocabRelatedCompoundsCopyText", "copy text")
    must_contain(lib, "入口", "入口 example")
    must_contain(lib, "いりぐち", "rendaku reading")
    must_contain(lib, "禁止不同音读", "prompt same reading")
    must_contain(helpers, "related_compounds", "schema/select")
    must_contain(helpers, "related_compounds_source", "source col")
    must_contain(share, "w.related_compounds", "shared select")
    must_contain(live, "related_compounds", "peek select")
    must_contain(fill, "related_compounds", "fill apply")
    must_contain(fill, "markRelatedCompoundsCheckedEmpty", "empty checked")
    must_contain(fill, "relatedStrippedToEmpty", "strip self → mark empty")
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
    # 整词假名：直接 surface+reading，勿拼括号再走 JpVocabFuriganaText（焚き火会拆坏）
    must_contain(section, "jp-vocab-furigana-reading", "whole-word furigana")
    must_contain(section, "item.surface", "surface under reading")
    must_contain(section, "item.reading", "reading under surface")
    section_src = section.read_text(encoding="utf-8")
    if "JpVocabFuriganaText" in section_src:
        raise SystemExit(
            "FAIL furigana display: related compounds must render surface+reading "
            "directly (not JpVocabFuriganaText / paren parse)"
        )
    if "`${item.surface}(${item.reading})`" in section_src or (
        "item.surface}(${item.reading}" in section_src
    ):
        raise SystemExit(
            "FAIL furigana display: do not rebuild paren string for related compounds"
        )
    must_contain(styles, "align-items: center", "reading centered under word")
    must_contain(styles, "align-items: flex-start", "zh aligns with surface row")
    must_contain(section, "复制全部", "copy all")
    must_contain(section, "copy-toast--above-modal", "toast z")
    must_contain(section, "related-compounds-flow", "inline flow")
    must_contain(section, "filterJpVocabRelatedCompoundsSameReading", "filter dirty")
    if "items.length === 0" not in section_src and "items.length==0" not in section_src:
        raise SystemExit(
            "FAIL empty ui: no related compounds must early-return (leave blank)"
        )
    if "已通过AI获取，但暂无相关词汇" in section_src:
        raise SystemExit(
            "FAIL empty ui: must not render placeholder when related compounds empty"
        )
    if "JP_VOCAB_RELATED_COMPOUNDS_EMPTY_CHECKED" in section_src:
        raise SystemExit(
            "FAIL empty ui: do not import/render EMPTY_CHECKED placeholder"
        )
    must_contain(styles, "related-compounds-flow", "flow css")
    must_contain(styles, "related-compounds-zh", "zh css")
    styles_text = styles.read_text(encoding="utf-8")
    # 日语与中文须空开（flex 会吃文本空格，应用 margin）
    zh_chunk = styles_text.split(".jp-vocab-teacher-quiz__related-compounds-zh", 1)[
        -1
    ].split("}", 1)[0]
    if "margin-left" not in zh_chunk:
        raise SystemExit("FAIL: related-compounds-zh 须 margin-left 与日语空开")
    flow_chunk = styles_text.split("related-compounds-flow", 1)[-1][:500]
    if "1.18rem" not in flow_chunk:
        raise SystemExit("FAIL: related-compounds-flow 字体应再放大（约 1.18rem）")
    if "#7eb8ff" not in styles_text:
        raise SystemExit("FAIL: 相关构词假名须用显眼颜色（如 #7eb8ff）")
    must_contain(lib, "normalizeJpVocabRelatedCompoundGloss", "gloss normalize")
    must_contain(lib, "上级，长辈", "multi sense comma example")
    must_contain(lib, "禁止在释义里用分号", "no semicolon in gloss prompt")

    # 一词多义：分号 → 中文逗号
    import importlib.util

    # 纯 Python 复刻 normalize（与 TS 同规则）
    def norm_gloss(g: str) -> str:
        import re as _re

        s = g.strip()
        s = _re.sub(r"[；;]+", "，", s)
        s = _re.sub(r"[／/|｜]+", "，", s)
        s = _re.sub(r"[、]+", "，", s)
        s = _re.sub(r"\s*，\s*", "，", s)
        s = _re.sub(r"^，+|，+$", "", s)
        return s.strip()

    if norm_gloss("上级；长辈") != "上级，长辈":
        raise SystemExit("FAIL: gloss semicolon → comma")
    if norm_gloss("上级/长辈") != "上级，长辈":
        raise SystemExit("FAIL: gloss slash → comma")

    must_contain(section, "related-compounds-source", "source footer")
    must_contain(styles, "related-compounds-source", "source footer css")
    section_text = section.read_text(encoding="utf-8")
    flow_pos = section_text.find("related-compounds-flow")
    label_pos = section_text.find("<JpVocabSourceLabel")
    if label_pos < 0 or (flow_pos >= 0 and label_pos < flow_pos):
        raise SystemExit(
            "FAIL: 相关构词来源须在正文下方（块底右下），勿放标题行"
        )

    must_contain(teacher, "JpVocabRelatedCompoundsSection", "teacher card")
    must_contain(teacher, "word={w.word}", "pass word")
    must_contain(review, "JpVocabRelatedCompoundsSection", "review card")
    must_contain(online, "related_compounds", "online batch")
    must_contain(online, "相关构词", "online prompt zh")
    must_contain(online, "禁止硬凑", "no forced compounds")
    must_contain(online, "同一次", "same request")
    must_contain(online, "禁止不同音读", "online same reading")
    must_contain(online, "mark_related_compounds_checked", "empty → mark source")
    online_text = online.read_text(encoding="utf-8")
    # 曾假成功：空 related 却 done.append("related_compounds") 且不写 source
    if '便于维护中心「补全内容」列显示「相关构词」' in online_text:
        raise SystemExit(
            "FAIL: 禁止空相关构词只记 applied 不写 source（维护中心假成功 / 卡片空白）"
        )
    if "mark_related_compounds_checked" not in online_text:
        raise SystemExit("FAIL: online batch 空相关构词须 mark_related_compounds_checked")
    must_contain(ai, "禁止不同音读", "ai prompt same reading")
    must_contain(lib, "没有自然", "empty ok hint")
    must_contain(lib, "最多 4～5", "max count hint")
    must_contain(lib, "禁止本词", "forbid lemma self in prompt")
    must_contain(online, "禁止本词", "online forbid lemma self")
    must_contain(ai, "禁止本词", "ai prompt forbid lemma self")
    # 曾硬拒 is_self / bad_line 导致统一补全整批失败；须丢掉坏行，勿 return 硬拒码
    lib_text_full = lib.read_text(encoding="utf-8")
    if 'return { ok: false, reason: "related_compounds_is_self" }' in lib_text_full:
        raise SystemExit(
            "FAIL: related_compounds_is_self 不得硬拒整批；须丢掉本词行（与不同音读同逻辑）"
        )
    if 'return { ok: false, reason: "related_compounds_bad_line" }' in lib_text_full:
        raise SystemExit(
            "FAIL: related_compounds_bad_line 不得硬拒整批；坏行丢掉，剥光则 \"\""
        )
    must_contain(lib, "整词假名", "forbid mid-word furigana in prompt")
    must_contain(online, "整词假名", "online forbid mid-word furigana")
    must_contain(online, "[口语", "online grammar usage frequency marker")
    must_contain(online, "五段", "online forbid academic verb class")
    must_contain(lib, "禁止本词", "forbid lemma self in prompt")
    must_contain(online, "禁止本词", "online forbid lemma self")
    must_contain(ai, "禁止本词", "ai prompt forbid lemma self")
    must_contain(types, "related_compounds?", "type field")

    line_re = re.compile(
        r"^([\u4E00-\u9FFF々〆ヶぁ-んァ-ンー]+)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]\s*[:：]\s*(.+)$"
    )
    ok = line_re.match("入口(いりぐち)：入口")
    bad = line_re.match("入口いりぐち")
    mid = line_re.match("決(き)まり：规定，惯例")
    if not ok or bad:
        raise SystemExit("FAIL: line parse smoke")
    if ok.group(2) != "いりぐち":
        raise SystemExit("FAIL: reading extract")
    if mid:
        raise SystemExit("FAIL: mid-word furigana must NOT match whole-line LINE_RE")

    # 同读启发：こと in ものごと；じ not match こと as substring of variants
    # （Python 烟测只验提示字符串存在；TS 校验由部署后 apply 覆盖）
    lib_text = lib.read_text(encoding="utf-8")
    if "こと→ごと" not in lib_text and "こと→ごと" not in online.read_text(
        encoding="utf-8"
    ):
        # prompt 里应有连浊例
        if "ごと" not in lib_text:
            raise SystemExit("FAIL: rendaku example missing")

    print("[check_jp_vocab_related_compounds] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
