#!/usr/bin/env python3
"""Regression: 存库「漢字(かな)」解析成 ruby 分段（与 TS parseJpVocabParenFurigana 一致）。"""

from __future__ import annotations

import re
import sys

PAREN_FURIGANA_RE = re.compile(
    r"([\u4E00-\u9FFF々]+)\(([ぁ-んァ-ンヴヵヶー]+)\)"
)


def parse_paren_furigana(text: str) -> list[tuple[str, str | None]]:
    """Return list of (value, reading|None). reading set => ruby base."""
    out: list[tuple[str, str | None]] = []
    last = 0
    for m in PAREN_FURIGANA_RE.finditer(text):
        if m.start() > last:
            out.append((text[last : m.start()], None))
        out.append((m.group(1), m.group(2)))
        last = m.end()
    if last < len(text):
        out.append((text[last:], None))
    return out or [(text, None)]


def strip_paren_furigana(text: str) -> str:
    return PAREN_FURIGANA_RE.sub(r"\1", text)


def main() -> int:
    cases = [
        (
            "電車(でんしゃ)に間(ま)に合(あ)いました。",
            [
                ("電車", "でんしゃ"),
                ("に", None),
                ("間", "ま"),
                ("に", None),
                ("合", "あ"),
                ("いました。", None),
            ],
            "電車に間に合いました。",
        ),
        (
            "もう少(すこ)し早(はや)く来(き)てください。",
            [
                ("もう", None),
                ("少", "すこ"),
                ("し", None),
                ("早", "はや"),
                ("く", None),
                ("来", "き"),
                ("てください。", None),
            ],
            "もう少し早く来てください。",
        ),
        ("ひらがなだけ", [("ひらがなだけ", None)], "ひらがなだけ"),
        ("", [], ""),
    ]

    failed = 0
    for raw, expected_segs, expected_plain in cases:
        got = parse_paren_furigana(raw) if raw else []
        plain = strip_paren_furigana(raw) if raw else ""
        if got != expected_segs or plain != expected_plain:
            failed += 1
            print("FAIL", repr(raw))
            print("  got segs ", got)
            print("  want segs", expected_segs)
            print("  got plain ", repr(plain))
            print("  want plain", repr(expected_plain))

    if failed:
        print(f"{failed} case(s) failed", file=sys.stderr)
        return 1
    print("ok: jp-vocab paren furigana parse")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
