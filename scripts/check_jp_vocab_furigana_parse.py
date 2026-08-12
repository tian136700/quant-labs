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
# 须认「焚き火」整词；中间假名不得跨过助词「は」等（今日は気分）。
_PAREN_BASE = (
    r"[\u4E00-\u9FFF々]+"
    r"(?:(?![はがをにでとへもやの])[ぁ-んァ-ンヴヵヶー]+[\u4E00-\u9FFF々]+)*"
    r"[ぁ-んァ-ンヴヵヶー]*"
)
PAREN_FURIGANA_RE = re.compile(
    rf"({_PAREN_BASE})[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]"
)
VALID_KANJI_FURIGANA_CHUNK = re.compile(
    rf"{_PAREN_BASE}[（(][ぁ-んァ-ンヴヵヶー]+[）)]"
)

INCOMPLETE_KANJI_CASES = [
    ("今日は気分(きぶん)がいいです。", True),
    ("今日(きょう)は気分(きぶん)がいいです。", False),
    ("電車(でんしゃ)に間(ま)に合(あ)いました。", False),
    ("いい方法があります。", True),
    ("焚き火(たきび)を見(み)ます。", False),
    ("焚き火を見(み)ます。", True),
]

CASES = [
    "友達(ゆうだつ)より静か(しずか)な場所(ばしょ)が好(す)きです。",
    "彼(かれ)は私(わたし)より年上(としうえ)です。",
    "この本(ほん)はあの本(ほん)より安(やす)いです。",
    "電車(でんしゃ)に間(ま)に合(あ)いました。",
    "友達（ゆうだつ）より静か（しずか）です。",
    "焚き火(たきび)と花火(はなび)です。",
]

# (raw, expected_after_sanitize) — nested teaching notes must vanish;
# particle sides spaced (はいくら → は いくら; 料金は高 → 料金 は 高)
SANITIZE_CASES = [
    (
        "必要な物(もの)をリストアップする。(必要なは必要だ(ひつようだ)の形容動詞形です)",
        "必要な物(もの) を リストアップする。",
    ),
    (
        "いい方法があります。",
        "いい方法 が あります。",
    ),
    (
        "（いい ほうほう が あります。）",
        "",
    ),
    (
        "授業(じゅぎょう)に必要(ひつよう)な本(ほん)を買(か)いました。",
        "授業(じゅぎょう) に 必要(ひつよう)な本(ほん) を 買(か)いました。",
    ),
    (
        "朝(あさ)ごはんにスプーンが必要(ひつよう)です。 / あさごはん / ひつよう",
        "朝(あさ)ごはんに スプーン が 必要(ひつよう)です。",
    ),
    (
        "今月(こんげつ)の給料(きゅうりょう)はいつ出(で)ますか。(N4)",
        "今月(こんげつ) の 給料(きゅうりょう) は いつ出(で)ますか。(N4)",
    ),
    (
        "先生(せんせい)はいつも丁寧(ていねい)に教(おし)えてくれます。(N4)",
        "先生(せんせい) は いつも丁寧(ていねい) に 教(おし)えてくれます。(N4)",
    ),
    (
        # already spaced → idempotent (may still add left space)
        "給料(きゅうりょう)は いつ出(で)ますか。",
        "給料(きゅうりょう) は いつ出(で)ますか。",
    ),
    (
        # do not split ではない / です
        "それは本(ほん)ではないです。",
        "それは 本(ほん)ではないです。",
    ),
    (
        # て形＋ください 不拆
        "遅(おく)れないでください。",
        "遅(おく)れないでください。",
    ),
    (
        "遊(あそ)んでください。",
        "遊(あそ)んでください。",
    ),
    (
        # をください 要拆
        "水(みず)をください。",
        "水(みず) を ください。",
    ),
    (
        # 读音里的「やまだ」禁止拆成「や まだ」
        "山田(やまだ)さんが働(はたら)く会社(かいしゃ)は東京(とうきょう)にあります。",
        "山田(やまだ)さんが 働(はたら)く会社(かいしゃ) は 東京(とうきょう) に あります。",
    ),
    (
        "私(わたし)がいつも行(い)く店(みせ)はここです。",
        "私(わたし) が いつも行(い)く店(みせ) は ここです。",
    ),
    (
        "電車(でんしゃ)の料金(りょうきん)はいくらですか。(N5)",
        "電車(でんしゃ) の 料金(りょうきん) は いくらですか。(N5)",
    ),
    (
        "このホテルの料金(りょうきん)は高(たか)いです。(N4)",
        "この ホテル の 料金(りょうきん) は 高(たか)いです。(N4)",
    ),
    (
        "上(あ)がります。",
        "上(あ)がります。",
    ),
    (
        "えーと、何(なん)でしたか。",
        "えーと、何(なん)でしたか。",
    ),
    (
        # 敬语接头辞假名重复 → sanitize 剥掉括注里的お／ご
        "お辞儀(おじぎ)をします。(N5)",
        "お辞儀(じぎ) をします。(N5)",
    ),
    (
        "もうご飯(ごはん)を食(た)べましたか。(N5)",
        "もうご飯(はん) を 食(た)べましたか。(N5)",
    ),
]

_LEARNER_KANA_AFTER_PARTICLE = sorted(
    [
        "いつも",
        "いつ",
        "いくら",
        "いくつ",
        "いかが",
        "どうして",
        "どうやって",
        "どんな",
        "どこ",
        "どれ",
        "どちら",
        "どっち",
        "どの",
        "どう",
        "だれ",
        "どなた",
        "なにか",
        "なに",
        "なんの",
        "なんで",
        "なぜ",
        "とても",
        "あまり",
        "すこし",
        "ちょっと",
        "たくさん",
        "みんな",
        "いろいろ",
        "ほんとうに",
        "はっきり",
        "ゆっくり",
        "ちゃんと",
        "ください",
        "たぶん",
        "きっと",
        "ぜひ",
        "やはり",
        "やっぱり",
        "かなり",
        "もっと",
        "ずっと",
        "もう",
        "まだ",
        "すぐ",
        "よく",
        "ここ",
        "そこ",
        "あそこ",
        "こちら",
        "そちら",
        "あちら",
        "こんなに",
        "そんなに",
        "あんなに",
        "こんな",
        "そんな",
        "あんな",
        "あります",
        "いません",
        "います",
        "ある",
        "いる",
    ],
    key=len,
    reverse=True,
)
_PARTICLE_LEARNER = "はがをにでともへのや"
_PARTICLE_CONTENT = "はがをにでへとのや"
_PARTICLE_BEFORE_LEARNER_KANA_RE = re.compile(
    rf"([{_PARTICLE_LEARNER}])({'|'.join(map(re.escape, _LEARNER_KANA_AFTER_PARTICLE))})"
)
_KATA_WORD = r"[ァ-ンヴヵヶ][ァ-ンヴヵヶー]*"
_CONTENT_BEFORE_PARTICLE_RE = re.compile(
    rf"(\x00P\d+\x00|[\u4E00-\u9FFF々]+|{_KATA_WORD})([{_PARTICLE_CONTENT}])"
)
_PARTICLE_BEFORE_CONTENT_RE = re.compile(
    rf"([{_PARTICLE_CONTENT}])(\x00P\d+\x00|[\u4E00-\u9FFF々]+|{_KATA_WORD})"
)
_DE_COPULA_RE = re.compile(r"^(す|した|しょう|ござ|あり|ある|あっ|は|も)")


def insert_jp_vocab_learner_particle_spaces(text: str) -> str:
    """Mirror of insertJpVocabLearnerParticleSpaces."""
    s = text or ""
    protected: list[str] = []

    def _protect(m: re.Match[str]) -> str:
        protected.append(m.group(0))
        return f"\x00P{len(protected) - 1}\x00"

    work = VALID_KANJI_FURIGANA_CHUNK.sub(_protect, s)

    def _ga_okurigana(after: str) -> bool:
        if not after:
            return False
        if after.startswith("\x00P"):
            return False
        if re.match(r"^[\u4E00-\u9FFF々ァ-ンヴヵヶ]", after):
            return False
        for w in _LEARNER_KANA_AFTER_PARTICLE:
            if after.startswith(w):
                return False
        return bool(re.match(r"^[ぁ-ん]", after))

    def _left(m: re.Match[str]) -> str:
        left, particle = m.group(1), m.group(2)
        after = work[m.end() :]
        if particle == "で" and _DE_COPULA_RE.match(after):
            return m.group(0)
        if particle == "が" and _ga_okurigana(after):
            return m.group(0)
        return f"{left} {particle}"

    work = _CONTENT_BEFORE_PARTICLE_RE.sub(_left, work)

    def _right_content(m: re.Match[str]) -> str:
        particle, right = m.group(1), m.group(2)
        if particle == "で" and _DE_COPULA_RE.match(work[m.start() + len(particle) :]):
            return m.group(0)
        return f"{particle} {right}"

    work = _PARTICLE_BEFORE_CONTENT_RE.sub(_right_content, work)

    def _repl(m: re.Match[str]) -> str:
        particle, word = m.group(1), m.group(2)
        if word == "ください" and particle == "で":
            prev = work[m.start() - 1] if m.start() > 0 else ""
            if prev in "なんいてり":
                return m.group(0)
        return f"{particle} {word}"

    work = _PARTICLE_BEFORE_LEARNER_KANA_RE.sub(_repl, work)

    def _restore(m: re.Match[str]) -> str:
        i = int(m.group(1))
        return protected[i] if 0 <= i < len(protected) else ""

    return re.sub(r"\x00P(\d+)\x00", _restore, work)


def leftover_paren_kana(text: str) -> str | None:
    leftover = PAREN_FURIGANA_RE.sub(r"\1", text)
    m = re.search(r"[（(][ぁ-んァ-ン]", leftover)
    return leftover if m else None


def sanitize_jp_vocab_example_japanese_line(text: str) -> str:
    """Mirror of sanitizeJpVocabExampleJapaneseLine in jp-vocab-example-sentences.ts"""
    s = (text or "").strip()
    if not s:
        return s

    # Mirror rewriteJpVocabHonorificFuriganaDup
    s = re.sub(
        r"([おご])([\u4E00-\u9FFF々]+(?:(?![はがをにでとへもやの])[ぁ-んァ-ンヴヵヶー]+[\u4E00-\u9FFF々]+)*[ぁ-んァ-ンヴヵヶー]*)[（(](\1[ぁ-んァ-ンヴヵヶー]+)[）)]",
        lambda m: f"{m.group(1)}{m.group(2)}({m.group(3)[len(m.group(1)):]})"
        if m.group(3)[len(m.group(1)) :]
        else m.group(0),
        s,
    )

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

    # Mirror JLPT tail peel so particle spacing + (N4) restore match TS
    jlpt_m = re.match(
        r"^(.*?)([。！？…])\s*[（(]\s*N\s*([1-5])\s*[）)]\s*$",
        s.strip(),
        flags=re.I,
    )
    jlpt_suffix = ""
    if jlpt_m:
        jlpt_suffix = f"(N{jlpt_m.group(3)})"
        s = f"{jlpt_m.group(1)}{jlpt_m.group(2)}"

    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"（[^（）]*）", "", s)
        s = re.sub(r"\([^()]*\)", "", s)

    def _restore(m: re.Match[str]) -> str:
        i = int(m.group(1))
        return protected[i] if 0 <= i < len(protected) else ""

    s = re.sub(r"\x00F(\d+)\x00", _restore, s)
    # Mirror rewriteJpVocabHonorificFuriganaDup：お辞儀(おじぎ)→お辞儀(じぎ)
    s = re.sub(
        r"([おご])([\u4E00-\u9FFF々]+)[（(](\1[ぁ-んァ-ンヴヵヶー]+)[）)]",
        lambda m: f"{m.group(1)}{m.group(2)}({m.group(3)[len(m.group(1)):]})"
        if len(m.group(3)) > len(m.group(1))
        else m.group(0),
        s,
    )
    s = insert_jp_vocab_learner_particle_spaces(s)
    s = re.sub(r"\s{2,}", " ", s).strip()
    if jlpt_suffix:
        return f"{s}{jlpt_suffix}"
    return s


def has_unannotated_kanji(text: str) -> bool:
    """Mirror of jpVocabExampleHasUnannotatedKanji in jp-vocab-example-sentences.ts"""
    without_valid = VALID_KANJI_FURIGANA_CHUNK.sub("", text or "")
    return bool(re.search(r"[\u4E00-\u9FFF]", without_valid))


def main() -> int:
    src = SRC.read_text(encoding="utf-8")
    if "JP_VOCAB_PAREN_FURIGANA_RE" not in src:
        print("[check_jp_vocab_furigana_parse] FAIL: regex export missing", file=sys.stderr)
        return 1
    # Must allow okurigana between kanji (焚き火) without eating particles (は)
    mixed_okurigana = "(?![はがをにでとへもやの])"
    if mixed_okurigana not in src or "JP_VOCAB_PAREN_FURIGANA_RE" not in src:
        print(
            "[check_jp_vocab_furigana_parse] FAIL: PAREN_FURIGANA_RE must allow "
            "okurigana between kanji (焚き火) and refuse particles (今日は気分)",
            file=sys.stderr,
        )
        return 1
    # Whole-word parse for okurigana compounds
    m = PAREN_FURIGANA_RE.search("焚き火(たきび)")
    if not m or m.group(1) != "焚き火" or m.group(2) != "たきび":
        print(
            "[check_jp_vocab_furigana_parse] FAIL: 焚き火(たきび) must parse as "
            f"one ruby unit, got {m.groups() if m else None}",
            file=sys.stderr,
        )
        return 1
    m2 = PAREN_FURIGANA_RE.search("今日は気分(きぶん)がいいです。")
    if not m2 or m2.group(1) != "気分":
        print(
            "[check_jp_vocab_furigana_parse] FAIL: must not eat particle は; "
            f"expected base 気分, got {m2.groups() if m2 else None}",
            file=sys.stderr,
        )
        return 1
    if "insertJpVocabLearnerParticleSpaces" not in src:
        print(
            "[check_jp_vocab_furigana_parse] FAIL: sanitize must call "
            "insertJpVocabLearnerParticleSpaces (はいつ → は いつ)",
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
        # (JLPT 尾标 (N5)/(N4) 存库保留，展示层另处理，不算裸括号)
        plain = PAREN_FURIGANA_RE.sub(r"\1", got)
        plain = re.sub(r"[（(]\s*N\s*[1-5]\s*[）)]\s*$", "", plain, flags=re.I)
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

    # 展示：汉字下方假名须够大、够亮（曾灰小到读不清）
    furigana_ui = (
        ROOT / "src/components/JpVocabFuriganaText.tsx"
    ).read_text(encoding="utf-8")
    if "currentColor 68%" in furigana_ui:
        print(
            "[check_jp_vocab_furigana_parse] FAIL: furigana reading must not use "
            "faded currentColor 68% (too hard to read)",
            file=sys.stderr,
        )
        return 1
    if "font-size: 0.48em" in furigana_ui or "font-size: 0.55em" in furigana_ui:
        print(
            "[check_jp_vocab_furigana_parse] FAIL: furigana reading font-size too small "
            "(use ≥0.64em)",
            file=sys.stderr,
        )
        return 1
    if "#8ec5ff" not in furigana_ui and "var(--accent)" not in furigana_ui:
        print(
            "[check_jp_vocab_furigana_parse] FAIL: furigana reading needs a clear "
            "accent color (e.g. #8ec5ff)",
            file=sys.stderr,
        )
        return 1
    # 助词空隙：半角空格在「はいくら」之间肉眼几乎看不见，展示须加宽
    if "word-spacing" not in furigana_ui:
        print(
            "[check_jp_vocab_furigana_parse] FAIL: JpVocabFuriganaText must set "
            "word-spacing so particle gaps (は いくら / は 高い) are visible",
            file=sys.stderr,
        )
        return 1
    if "jp-vocab-learner-particle" not in furigana_ui:
        print(
            "[check_jp_vocab_furigana_parse] FAIL: spaced particles must wrap "
            "jp-vocab-learner-particle (padding) so は does not glue to next word",
            file=sys.stderr,
        )
        return 1

    print(
        f"[check_jp_vocab_furigana_parse] OK "
        f"({len(CASES)} parse + {len(SANITIZE_CASES)} sanitize + "
        f"{len(INCOMPLETE_KANJI_CASES)} incomplete-kanji cases + visibility)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
