#!/usr/bin/env python3
"""回归：熟语假名须整词标注；拒 出(で)発(ぱつ) 等错拆。"""

from __future__ import annotations

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
    must_contain(jukugo, "出(で)発(ぱつ)", "bad example in hint")
    must_contain(ai, "wrong_jukugo_furigana", "reject reason")
    must_contain(ai, "jpVocabExampleHasWrongJukugoFurigana", "wired into validate")
    must_contain(ai, "JP_VOCAB_JUKUGO_FURIGANA_PROMPT_HINT", "prompt hint")

    online = ROOT / "scripts/jp-vocab-fill-online-batch-api.py"
    meaning = ROOT / "scripts/jp-vocab-fill-meaning-api.py"
    must_contain(online, "出(で)発(ぱつ)", "online batch WORD/GRAMMAR prompt")
    must_contain(online, "出発(しゅっぱつ)", "online batch good example")
    must_contain(meaning, "出(で)発(ぱつ)", "meaning API prompt")

    # Pure-Python smoke (mirror TS detector for 出発)
    import re

    text_bad = "そろそろ出(で)発(ぱつ)の時間(じかん)です。"
    text_ok = "そろそろ出発(しゅっぱつ)の時間(じかん)です。"
    run_re = re.compile(r"(?:[\u4E00-\u9FFF々][（(][ぁ-んァ-ンヴヵヶー]+[）)]){2,}")
    chunk_re = re.compile(r"([\u4E00-\u9FFF々])[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]")
    expected = {"出発": "しゅっぱつ"}

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
        return False

    if not has_wrong(text_bad):
        raise SystemExit("FAIL: bad 出発 split not detected")
    if has_wrong(text_ok):
        raise SystemExit("FAIL: good 出発 flagged")

    print("[check_jp_vocab_jukugo_furigana] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
