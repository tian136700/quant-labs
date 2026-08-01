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
    must_contain(jukugo, "出(で)発(ぱつ)", "bad example in hint")
    must_contain(jukugo, "入口(いりくち)", "rendaku bad example in hint")
    must_contain(jukugo, "WHOLE_JUKUGO_FURI_RE", "whole-word detector")
    must_contain(ai, "wrong_jukugo_furigana", "reject reason")
    must_contain(ai, "jpVocabExampleHasWrongJukugoFurigana", "wired into validate")
    must_contain(ai, "JP_VOCAB_JUKUGO_FURIGANA_PROMPT_HINT", "prompt hint")

    online = ROOT / "scripts/jp-vocab-fill-online-batch-api.py"
    meaning = ROOT / "scripts/jp-vocab-fill-meaning-api.py"
    must_contain(online, "出(で)発(ぱつ)", "online batch WORD/GRAMMAR prompt")
    must_contain(online, "出発(しゅっぱつ)", "online batch good example")
    must_contain(online, "入口(いりぐち)", "online batch rendaku good")
    must_contain(online, "入口(いりくち)", "online batch rendaku bad")
    must_contain(meaning, "出(で)発(ぱつ)", "meaning API prompt")
    must_contain(meaning, "入口(いりぐち)", "meaning API rendaku")

    # Pure-Python smoke (mirror TS detector for 出発 split + 入口 whole-word)
    text_bad_split = "そろそろ出(で)発(ぱつ)の時間(じかん)です。"
    text_ok_split = "そろそろ出発(しゅっぱつ)の時間(じかん)です。"
    text_bad_rendaku = "このビルの入口(いりくち)はどこですか。"
    text_ok_rendaku = "このビルの入口(いりぐち)はどこですか。"
    run_re = re.compile(r"(?:[\u4E00-\u9FFF々][（(][ぁ-んァ-ンヴヵヶー]+[）)]){2,}")
    chunk_re = re.compile(r"([\u4E00-\u9FFF々])[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]")
    whole_re = re.compile(r"([\u4E00-\u9FFF々]{2,4})[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]")
    expected = {"出発": "しゅっぱつ", "入口": "いりぐち", "時間": "じかん"}

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

    print("[check_jp_vocab_jukugo_furigana] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
