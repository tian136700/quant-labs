#!/usr/bin/env python3
"""Regression: example furigana parser / sanitize must not leave raw parens on screen.

Fails if:
- JP_VOCAB_PAREN_FURIGANA_RE regresses to pure-kanji-only bases
  (e.g. 静か(しずか) would leak parentheses into JpVocabFuriganaText)
- sanitizeJpVocabExampleJapaneseLine fails to strip nested teaching-note parens
  (e.g. 。(必要なは必要だ(ひつようだ)の形容動詞形です))
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "lib" / "jp-vocab-example-sentences.ts"

# Mirror of JP_VOCAB_PAREN_FURIGANA_RE / VALID_KANJI_FURIGANA_CHUNK (keep in sync with TS)
PAREN_FURIGANA_RE = re.compile(
    r"([\u4E00-\u9FFF々]+[ぁ-んァ-ンヴヵヶー]*)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]"
)
VALID_KANJI_FURIGANA_CHUNK = re.compile(
    r"[\u4E00-\u9FFF々]+[ぁ-んァ-ンヴヵヶー]*[（(][ぁ-んァ-ンヴヵヶー]+[）)]"
)

INCOMPLETE_KANJI_CASES = [
    ("今日は気分(きぶん)がいいです。", True),
    ("今日(きょう)は気分(きぶん)がいいです。", False),
    ("電車(でんしゃ)に間(ま)に合(あ)いました。", False),
    ("いい方法があります。", True),
]

CASES = [
    "友達(ゆうだつ)より静か(しずか)な場所(ばしょ)が好(す)きです。",
    "彼(かれ)は私(わたし)より年上(としうえ)です。",
    "この本(ほん)はあの本(ほん)より安(やす)いです。",
    "電車(でんしゃ)に間(ま)に合(あ)いました。",
    "友達（ゆうだつ）より静か（しずか）です。",
]

# (raw, expected_after_sanitize) — nested teaching notes must vanish
SANITIZE_CASES = [
    (
        "必要な物(もの)をリストアップする。(必要なは必要だ(ひつようだ)の形容動詞形です)",
        "必要な物(もの)をリストアップする。",
    ),
    (
        "いい方法があります。",
        "いい方法があります。",
    ),
    (
        "（いい ほうほう が あります。）",
        "",
    ),
    (
        "授業(じゅぎょう)に必要(ひつよう)な本(ほん)を買(か)いました。",
        "授業(じゅぎょう)に必要(ひつよう)な本(ほん)を買(か)いました。",
    ),
    (
        "朝(あさ)ごはんにスプーンが必要(ひつよう)です。 / あさごはん / ひつよう",
        "朝(あさ)ごはんにスプーンが必要(ひつよう)です。",
    ),
]


def leftover_paren_kana(text: str) -> str | None:
    leftover = PAREN_FURIGANA_RE.sub(r"\1", text)
    m = re.search(r"[（(][ぁ-んァ-ン]", leftover)
    return leftover if m else None


def sanitize_jp_vocab_example_japanese_line(text: str) -> str:
    """Mirror of sanitizeJpVocabExampleJapaneseLine in jp-vocab-example-sentences.ts"""
    s = (text or "").strip()
    if not s:
        return s

    # Mirror TS: strip after the first slash outside furigana parentheses.
    depth = 0
    for i, ch in enumerate(s):
        if ch in ("(", "（"):
            depth += 1
            continue
        if ch in (")", "）"):
            depth = max(0, depth - 1)
            continue
        if ch in ("/", "／") and depth == 0:
            s = s[:i].strip()
            break
    protected: list[str] = []

    def _protect(m: re.Match[str]) -> str:
        idx = len(protected)
        protected.append(m.group(0))
        return f"\x00F{idx}\x00"

    s = VALID_KANJI_FURIGANA_CHUNK.sub(_protect, s)
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"（[^（）]*）", "", s)
        s = re.sub(r"\([^()]*\)", "", s)

    def _restore(m: re.Match[str]) -> str:
        i = int(m.group(1))
        return protected[i] if 0 <= i < len(protected) else ""

    s = re.sub(r"\x00F(\d+)\x00", _restore, s)
    return re.sub(r"\s{2,}", " ", s).strip()


def has_unannotated_kanji(text: str) -> bool:
    """Mirror of jpVocabExampleHasUnannotatedKanji in jp-vocab-example-sentences.ts"""
    without_valid = VALID_KANJI_FURIGANA_CHUNK.sub("", text or "")
    return bool(re.search(r"[\u4E00-\u9FFF]", without_valid))


def main() -> int:
    src = SRC.read_text(encoding="utf-8")
    if "JP_VOCAB_PAREN_FURIGANA_RE" not in src:
        print("[check_jp_vocab_furigana_parse] FAIL: regex export missing", file=sys.stderr)
        return 1
    # Must allow optional kana after kanji (な/い adjectives)
    if "+[ぁ-んァ-ンヴヵヶー]*" not in src or "JP_VOCAB_PAREN_FURIGANA_RE" not in src:
        print(
            "[check_jp_vocab_furigana_parse] FAIL: PAREN_FURIGANA_RE must allow "
            "trailing kana after kanji (静か(しずか))",
            file=sys.stderr,
        )
        return 1
    if "protectedChunks" not in src and "\\u0000F" not in src and "\u0000F" not in src:
        # TS source uses `\u0000F${idx}\u0000` — check for protect-strip-restore pattern
        if "protectedChunks" not in src:
            print(
                "[check_jp_vocab_furigana_parse] FAIL: sanitize must protect valid "
                "furigana then strip remaining paren blocks (nested teaching notes)",
                file=sys.stderr,
            )
            return 1

    for case in CASES:
        leaked = leftover_paren_kana(case)
        if leaked is not None:
            print(
                f"[check_jp_vocab_furigana_parse] FAIL: paren kana leaked in:\n  {case}\n"
                f"  after strip: {leaked}",
                file=sys.stderr,
            )
            return 1

    for raw, expected in SANITIZE_CASES:
        got = sanitize_jp_vocab_example_japanese_line(raw)
        if got != expected:
            print(
                "[check_jp_vocab_furigana_parse] FAIL: sanitize mismatch\n"
                f"  raw:      {raw!r}\n"
                f"  got:      {got!r}\n"
                f"  expected: {expected!r}",
                file=sys.stderr,
            )
            return 1
        # After sanitize + furigana strip, no paren chars may remain
        plain = PAREN_FURIGANA_RE.sub(r"\1", got)
        if re.search(r"[（(]", plain):
            print(
                "[check_jp_vocab_furigana_parse] FAIL: paren still visible after sanitize:\n"
                f"  {raw!r} -> {got!r}",
                file=sys.stderr,
            )
            return 1

    for raw, expect_incomplete in INCOMPLETE_KANJI_CASES:
        got = has_unannotated_kanji(raw)
        if got != expect_incomplete:
            print(
                "[check_jp_vocab_furigana_parse] FAIL: incomplete kanji detection:\n"
                f"  {raw!r} expect={expect_incomplete} got={got}",
                file=sys.stderr,
            )
            return 1

    print(
        f"[check_jp_vocab_furigana_parse] OK "
        f"({len(CASES)} parse + {len(SANITIZE_CASES)} sanitize + "
        f"{len(INCOMPLETE_KANJI_CASES)} incomplete-kanji cases)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
