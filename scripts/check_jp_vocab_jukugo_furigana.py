#!/usr/bin/env python3
"""回归：熟语假名须整词标注；拒 出(で)発(ぱつ)、入口(いりくち) 等错读/漏连浊。"""

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
    jukugo = ROOT / "src/lib/jp-vocab-jukugo-furigana.ts"
    ai = ROOT / "src/lib/jp-vocab-example-sentences-ai.ts"

    must_contain(jukugo, "jpVocabExampleHasWrongJukugoFurigana", "detector")
    must_contain(jukugo, "出発", "出発 in dict")
    must_contain(jukugo, "しゅっぱつ", "出発 reading")
    must_contain(jukugo, "入口", "入口 in dict")
    must_contain(jukugo, "いりぐち", "入口 reading (rendaku)")
    must_contain(jukugo, "何時", "何時 in dict")
    must_contain(jukugo, "なんじ", "何時 reading (nanji)")
    must_contain(jukugo, "友達", "友達 in dict")
    must_contain(jukugo, "ともだち", "友達 reading (tomodachi)")
    must_contain(jukugo, "何時(なんどき)", "何時 bad example in hint")
    must_contain(jukugo, "友達(ゆうだち)", "友達/夕立 confusion in hint")
    must_contain(jukugo, "出(で)発(ぱつ)", "bad example in hint")
    must_contain(jukugo, "入口(いりくち)", "rendaku bad example in hint")
    must_contain(jukugo, "六(ろく)つ", "tutsu counter bad via quantity hint embed")
    # 六(むっ)つ 等正文在 quantity 模块；jukugo prompt 用 ${JP_VOCAB_QUANTITY_FURIGANA_PROMPT_HINT}
    must_contain(jukugo, "JP_VOCAB_QUANTITY_FURIGANA_PROMPT_HINT", "quantity hint embedded")
    must_contain(jukugo, "jpVocabExampleHasWrongTutsuCounterFurigana", "tutsu detector re-export")
    must_contain(jukugo, "jpVocabExampleHasWrongQuantityFurigana", "quantity detector")
    must_contain(jukugo, "JP_VOCAB_TUTSU_COUNTER_STEM", "tutsu stem dict re-export")
    quantity = ROOT / "src/lib/jp-vocab-quantity-furigana.ts"
    must_contain(quantity, "六(むっ)つ", "tutsu counter good in quantity hint")
    must_contain(quantity, "六(ろく)つ", "tutsu counter bad in quantity hint")
    must_contain(quantity, "九(きゅう)時", "clock bad in quantity hint")
    must_contain(quantity, "二十歳(はたち)", "age good in quantity hint")
    must_contain(quantity, "jpVocabExampleHasWrongQuantityFurigana", "quantity module detector")
    must_contain(quantity, "JP_VOCAB_NIN_COUNTER_FULL", "nin counter")
    must_contain(quantity, "JP_VOCAB_KA_DAY_FULL", "ka day counter")
    must_contain(quantity, "JP_VOCAB_JI_CLOCK_FULL", "ji clock")
    must_contain(quantity, "JP_VOCAB_AGE_FULL", "age twenty")
    must_contain(jukugo, "お辞儀(おじぎ)", "honorific dup bad in hint")
    must_contain(jukugo, "お辞儀(じぎ)", "honorific correct in hint")
    must_contain(jukugo, "rewriteJpVocabHonorificFuriganaDup", "honorific rewrite")
    must_contain(jukugo, "jpVocabExampleHasHonorificFuriganaDup", "honorific detector")
    must_contain(jukugo, "WHOLE_JUKUGO_FURI_RE", "whole-word detector")
    must_contain(ai, "wrong_jukugo_furigana", "reject reason")
    must_contain(ai, "jpVocabExampleHasWrongJukugoFurigana", "wired into validate")
    must_contain(ai, "JP_VOCAB_JUKUGO_FURIGANA_PROMPT_HINT", "prompt hint")
    must_contain(ai, "お辞儀(じぎ)", "honorific rule in upload_spec")

    examples = ROOT / "src/lib/jp-vocab-example-sentences.ts"
    must_contain(examples, "absorbHonorificPrefixIntoRuby", "display absorb honorific")
    must_contain(examples, "rewriteJpVocabHonorificFuriganaDup", "sanitize honorific rewrite")

    # honorific dup rewrite smoke
    dup_re = re.compile(
        r"([おご])([\u4E00-\u9FFF々]+(?:(?![はがをにでとへもやの])[ぁ-んァ-ンヴヵヶー]+[\u4E00-\u9FFF々]+)*[ぁ-んァ-ンヴヵヶー]*)[（(](\1[ぁ-んァ-ンヴヵヶー]+)[）)]"
    )

    def rewrite_honorific(s: str) -> str:
        def repl(m: re.Match[str]) -> str:
            honorific, base, reading = m.group(1), m.group(2), m.group(3)
            rest = reading[len(honorific) :]
            if not rest:
                return m.group(0)
            return f"{honorific}{base}({rest})"

        return dup_re.sub(repl, s)

    assert rewrite_honorific("お辞儀(おじぎ)をします。") == "お辞儀(じぎ)をします。"
    assert rewrite_honorific("ご飯(ごはん)を食(た)べます。") == "ご飯(はん)を食(た)べます。"
    assert rewrite_honorific("お金(かね)がありません。") == "お金(かね)がありません。"

    online = ROOT / "scripts/jp-vocab-fill-online-batch-api.py"
    meaning = ROOT / "scripts/jp-vocab-fill-meaning-api.py"
    must_contain(online, "出(で)発(ぱつ)", "online batch WORD/GRAMMAR prompt")
    must_contain(online, "出発(しゅっぱつ)", "online batch good example")
    must_contain(online, "入口(いりぐち)", "online batch rendaku good")
    must_contain(online, "入口(いりくち)", "online batch rendaku bad")
    must_contain(online, "友達(ともだち)", "online batch 友達 good")
    must_contain(online, "友達(ゆうだち)", "online batch 友達/夕立 bad")
    must_contain(meaning, "出(で)発(ぱつ)", "meaning API prompt")
    must_contain(meaning, "入口(いりぐち)", "meaning API rendaku")

    # Pure-Python smoke (mirror TS detector for 出発 split + 入口 whole-word)
    text_bad_split = "そろそろ出(で)発(ぱつ)の時間(じかん)です。"
    text_ok_split = "そろそろ出発(しゅっぱつ)の時間(じかん)です。"
    text_bad_rendaku = "このビルの入口(いりくち)はどこですか。"
    text_ok_rendaku = "このビルの入口(いりぐち)はどこですか。"
    text_bad_nanji = "失礼(しつれい)ですが、何時(なんどき)ですか。"
    text_ok_nanji = "失礼(しつれい)ですが、何時(なんじ)ですか。"
    text_bad_tomodachi = "友達(ゆうだち)が来(き)るから、家(いえ)の掃除(そうじ)が必要(ひつよう)です。"
    text_ok_tomodachi = "友達(ともだち)が来(き)るから、家(いえ)の掃除(そうじ)が必要(ひつよう)です。"
    run_re = re.compile(r"(?:[\u4E00-\u9FFF々][（(][ぁ-んァ-ンヴヵヶー]+[）)]){2,}")
    chunk_re = re.compile(r"([\u4E00-\u9FFF々])[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]")
    whole_re = re.compile(r"([\u4E00-\u9FFF々]{2,4})[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]")
    expected = {
        "出発": "しゅっぱつ",
        "入口": "いりぐち",
        "時間": "じかん",
        "何時": "なんじ",
        "友達": "ともだち",
        "掃除": "そうじ",
        "必要": "ひつよう",
    }

    def has_wrong(s: str) -> bool:
        for m in run_re.finditer(s):
            parts = chunk_re.findall(m.group(0))
            for L in range(2, min(len(parts), 4) + 1):
                for i in range(0, len(parts) - L + 1):
                    surface = "".join(p[0] for p in parts[i : i + L])
                    if surface not in expected:
                        continue
                    split = "".join(p[1] for p in parts[i : i + L])
                    if split != expected[surface]:
                        return True
        for m in whole_re.finditer(s):
            surface, reading = m.group(1), m.group(2)
            if surface in expected and reading != expected[surface]:
                return True
        return False

    if not has_wrong(text_bad_split):
        raise SystemExit("FAIL: bad 出発 split not detected")
    if has_wrong(text_ok_split):
        raise SystemExit("FAIL: good 出発 flagged")
    if not has_wrong(text_bad_rendaku):
        raise SystemExit("FAIL: bad 入口(いりくち) not detected")
    if has_wrong(text_ok_rendaku):
        raise SystemExit("FAIL: good 入口(いりぐち) flagged")
    if not has_wrong(text_bad_nanji):
        raise SystemExit("FAIL: bad 何時(なんどき) not detected")
    if has_wrong(text_ok_nanji):
        raise SystemExit("FAIL: good 何時(なんじ) flagged")
    if not has_wrong(text_bad_tomodachi):
        raise SystemExit("FAIL: bad 友達(ゆうだち) not detected")
    if has_wrong(text_ok_tomodachi):
        raise SystemExit("FAIL: good 友達(ともだち) flagged")

    # 数量词训读：〜つ／人／日／歳／几点（纯 Python 镜像）
    def has_wrong_quantity(s: str) -> bool:
        checks = [
            (
                re.compile(r"([一二三四五六七八九])[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]つ"),
                {
                    "一": "ひと",
                    "二": "ふた",
                    "三": "みっ",
                    "四": "よっ",
                    "五": "いつ",
                    "六": "むっ",
                    "七": "なな",
                    "八": "やっ",
                    "九": "ここの",
                },
            ),
            (
                re.compile(
                    r"(一つ|二つ|三つ|四つ|五つ|六つ|七つ|八つ|九つ)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]"
                ),
                {
                    "一つ": "ひとつ",
                    "二つ": "ふたつ",
                    "三つ": "みっつ",
                    "四つ": "よっつ",
                    "五つ": "いつつ",
                    "六つ": "むっつ",
                    "七つ": "ななつ",
                    "八つ": "やっつ",
                    "九つ": "ここのつ",
                },
            ),
            (
                re.compile(r"([一二])[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]人"),
                {"一": "ひと", "二": "ふた"},
            ),
            (
                re.compile(r"(一人|二人)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]"),
                {"一人": "ひとり", "二人": "ふたり"},
            ),
            (
                re.compile(r"([二三四五六七八九十])[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]日"),
                {
                    "二": "ふつ",
                    "三": "みっ",
                    "四": "よっ",
                    "五": "いつ",
                    "六": "むい",
                    "七": "なの",
                    "八": "よう",
                    "九": "ここの",
                    "十": "とお",
                },
            ),
            (
                re.compile(
                    r"(二日|三日|四日|五日|六日|七日|八日|九日|十日|十四日|二十日|二十四日)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]"
                ),
                {
                    "二日": "ふつか",
                    "三日": "みっか",
                    "四日": "よっか",
                    "五日": "いつか",
                    "六日": "むいか",
                    "七日": "なのか",
                    "八日": "ようか",
                    "九日": "ここのか",
                    "十日": "とおか",
                    "十四日": "じゅうよっか",
                    "二十日": "はつか",
                    "二十四日": "にじゅうよっか",
                },
            ),
        ]
        for cre, okmap in checks:
            for m in cre.finditer(s):
                exp = okmap.get(m.group(1))
                if exp and m.group(2) != exp:
                    return True
        ji_stem = re.compile(r"([四七九])[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]時")
        ji_ok = {"四": {"よ"}, "七": {"しち", "なな"}, "九": {"く"}}
        for m in ji_stem.finditer(s):
            allowed = ji_ok.get(m.group(1))
            if allowed and m.group(2) not in allowed:
                return True
        age_comp = re.compile(
            r"二十[（(]([ぁ-んァ-ンヴヵヶー]+)[）)][歳才][（(]([ぁ-んァ-ンヴヵヶー]+)[）)]"
        )
        for m in age_comp.finditer(s):
            if m.group(1) + m.group(2) != "はたち":
                return True
        age_full = re.compile(r"(二十歳|二十才)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]")
        for m in age_full.finditer(s):
            if m.group(2) != "はたち":
                return True
        return False

    cases = [
        ("餃子(ぎょうざ) を 六(ろく)つ 食(た)べました。", True, "六(ろく)つ"),
        ("餃子(ぎょうざ) を 六(むっ)つ 食(た)べました。", False, "六(むっ)つ"),
        ("六(ろく)時(じ) に 帰(かえ)ります。", False, "六(ろく)時 ok"),
        ("一(いち)人 来(き)ました。", True, "一(いち)人"),
        ("一(ひと)人 来(き)ました。", False, "一(ひと)人"),
        ("二(に)日 です。", True, "二(に)日"),
        ("二(ふつ)日 です。", False, "二(ふつ)日"),
        ("九(きゅう)時(じ) です。", True, "九(きゅう)時"),
        ("九(く)時(じ) です。", False, "九(く)時"),
        ("七(なな)時(じ) です。", False, "七(なな)時"),
        ("二十(にじゅう)歳(さい) です。", True, "二十(にじゅう)歳"),
        ("二十歳(はたち) です。", False, "二十歳(はたち)"),
        ("楽(たの)しい一(いち)日(にち)でした。", False, "一日=いちにち ok"),
    ]
    for text, expect_bad, label in cases:
        got = has_wrong_quantity(text)
        if got != expect_bad:
            raise SystemExit(f"FAIL quantity {label}: got={got} expect_bad={expect_bad}")

    must_contain(online, "六(むっ)つ", "online batch tutsu good")
    must_contain(online, "六(ろく)つ", "online batch tutsu bad")
    must_contain(online, "二十歳(はたち)", "online batch age good")
    must_contain(online, "九(く)時", "online batch clock good")
    must_contain(meaning, "六(むっ)つ", "meaning API tutsu good")
    must_contain(meaning, "六(ろく)つ", "meaning API tutsu bad")
    must_contain(meaning, "二十歳(はたち)", "meaning API age")

    print("[check_jp_vocab_jukugo_furigana] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
