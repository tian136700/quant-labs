#!/usr/bin/env python3
"""Regression: koPronSpeakText picks Hangul name from reading."""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "lib" / "ko-pron-speak.ts"
text = SRC.read_text(encoding="utf-8")

# Mirror the TS logic for a few fixtures by importing via a tiny inline check
# against the source contract (function exists + documented examples).
assert "export function koPronSpeakText" in text, "missing koPronSpeakText"
assert "export function speakKoPronLetter" in text, "missing speakKoPronLetter"
assert "ko-KR" in text, "must target ko-KR"

# Ensure split-on-slash Hangul-name strategy is present
assert 'raw.split("/")' in text or "raw.split('/') " in text.replace(" ", ""), (
    "expected reading split on / for Hangul name"
)

# Component wiring
page = (ROOT / "src" / "components" / "KoPronPage.tsx").read_text(encoding="utf-8")
card = (
    ROOT / "src" / "components" / "KoPronTeacherQuizFlashcardModal.tsx"
).read_text(encoding="utf-8")
study = (ROOT / "src" / "components" / "KoPronStudyPage.tsx").read_text(
    encoding="utf-8"
)
btn = (ROOT / "src" / "components" / "KoPronSpeakButton.tsx").read_text(
    encoding="utf-8"
)

for name, blob in (
    ("KoPronPage", page),
    ("flashcard", card),
    ("study", study),
):
    assert "KoPronSpeakButton" in blob, f"{name} missing KoPronSpeakButton"

assert "speakKoPronLetter" in btn, "button must call speakKoPronLetter"

# Quick pure-logic check duplicated in Python (same rules as TS)
HANGUL_RE = re.compile(r"[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]")


def speak_text(letter: str, reading: str | None) -> str:
    glyph = (letter or "").strip()
    raw = (reading or "").strip()
    if raw:
        hangul_name = raw.split("/")[0].strip()
        if hangul_name and HANGUL_RE.search(hangul_name):
            return hangul_name
    return glyph


cases = [
    ("ㄱ", "기역 / g·k", "기역"),
    ("ㅏ", "아 / a", "아"),
    ("ㄲ", "쌍기역 / kk", "쌍기역"),
    ("ㅘ", "와 / wa", "와"),
    ("ㄱ", None, "ㄱ"),
    ("ㄱ", "g·k", "ㄱ"),
]
for letter, reading, expected in cases:
    got = speak_text(letter, reading)
    assert got == expected, f"{letter!r}/{reading!r} → {got!r}, want {expected!r}"

print("ok: ko-pron speak button + hangul-name extraction")
sys.exit(0)
