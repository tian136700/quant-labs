#!/usr/bin/env python3
"""回归：英语多词固定搭配勿标 adj/adv（须 phrase）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from en_vocab_pos import rewrite_pos_for_lemma  # noqa: E402

MEANING_TS = ROOT / "src" / "lib" / "en-vocab-meaning-ai.ts"
FILL_MEANING_TS = ROOT / "src" / "lib" / "en-vocab-fill-meaning.ts"
USAGE_TS = ROOT / "src" / "lib" / "en-vocab-usage-ai.ts"
NOTES_TS = ROOT / "src" / "lib" / "en-vocab-db" / "notes_fields.ts"
ONLINE = ROOT / "scripts" / "en-vocab-fill-online-batch-api.py"
MEANING_PY = ROOT / "scripts" / "en-vocab-fill-meaning-api.py"


CASES = [
    ("unbearably tough", "adj", "phrase"),
    ("in time", "adv", "phrase"),
    ("strong and able", "adj/adv", "phrase"),
    ("look forward to", "v", "v"),
    ("in spite of", "prep", "prep"),
    ("attractive", "adj", "adj"),
    ("give up", "v", "v"),
]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    for path in (MEANING_TS, FILL_MEANING_TS, USAGE_TS, NOTES_TS, ONLINE, MEANING_PY):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    meaning = MEANING_TS.read_text(encoding="utf-8")
    if "enVocabLemmaNeedsPhrasePos" not in meaning:
        fail("meaning-ai must export enVocabLemmaNeedsPhrasePos")
    if "unbearably tough" not in meaning:
        fail("meaning prompt must mention unbearably tough → phrase")
    if "rewritePosTokensForLemma" not in meaning:
        fail("meaning-ai must rewrite adj/adv collocations to phrase")

    fill = FILL_MEANING_TS.read_text(encoding="utf-8")
    if "normalizeEnVocabPos(posRaw, row.word)" not in fill:
        fail("fill-meaning apply must normalize pos with lemma even on force")

    usage_fill = (ROOT / "src" / "lib" / "en-vocab-fill-usage.ts").read_text(
        encoding="utf-8"
    )
    if "phrase_labeled_as_adj_adv" not in usage_fill:
        fail("fill-usage force path must still reject phrase_labeled_as_adj_adv")

    usage = USAGE_TS.read_text(encoding="utf-8")
    if "短语：" not in usage or "unbearably tough" not in usage:
        fail("usage prompt must tell model to start collocations with 短语：")
    if "phrase_labeled_as_adj_adv" not in usage:
        fail("usage validate must reject 形容词：/副词： on multi-word lemmas")

    notes = NOTES_TS.read_text(encoding="utf-8")
    if "normalizeEnVocabPos" not in notes:
        fail("edit path notes_fields must normalize pos")

    online = ONLINE.read_text(encoding="utf-8")
    if "rewrite_pos_for_lemma" not in online:
        fail("online-batch must rewrite pos for multi-word collocations")
    if 'pos \\"phrase\\"' not in online and 'pos "phrase"' not in online:
        fail("online-batch SYSTEM must tell model to use phrase for collocations")

    meaning_py = MEANING_PY.read_text(encoding="utf-8")
    if "rewrite_pos_for_lemma" not in meaning_py:
        fail("local meaning fill must rewrite pos for lemma")

    for word, raw, expected in CASES:
        got = rewrite_pos_for_lemma(word, raw)
        if got != expected:
            fail(f"{word!r} + {raw!r} → {got!r}, expected {expected!r}")

    print("ok: en-vocab phrase pos")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
