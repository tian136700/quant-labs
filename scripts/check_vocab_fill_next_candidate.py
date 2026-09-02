#!/usr/bin/env python3
"""词表补全：online batch 须单次 fill-next-candidate，禁止 5 路 list_missing。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    en_batch = ROOT / "scripts/en-vocab-fill-online-batch-api.py"
    jp_batch = ROOT / "scripts/jp-vocab-fill-online-batch-api.py"
    en_route = ROOT / "src/app/api/en-vocab/fill-next-candidate/route.ts"
    jp_route = ROOT / "src/app/api/jp-vocab/fill-next-candidate/route.ts"
    en_lib = ROOT / "src/lib/en-vocab-fill-next-candidate.ts"
    jp_lib = ROOT / "src/lib/jp-vocab-fill-next-candidate.ts"

    for path in (en_batch, jp_batch, en_route, jp_route, en_lib, jp_lib):
        if not path.is_file():
            errors.append(f"missing {path.relative_to(ROOT)}")

    if en_batch.is_file():
        text = en_batch.read_text(encoding="utf-8")
        if "fill-next-candidate" not in text:
            errors.append("en online batch missing fill-next-candidate")
        if 'for url in (READING_URL, MEANING_URL' in text:
            errors.append("en online batch still loops list_missing URLs")
        if "list_missing" in text and "FILL_NEXT_URL" not in text:
            errors.append("en batch list_missing without FILL_NEXT_URL")

    if jp_batch.is_file():
        text = jp_batch.read_text(encoding="utf-8")
        if "fill-next-candidate" not in text:
            errors.append("jp online batch missing fill-next-candidate")
        if 'for url in (READING_URL, MEANING_URL' in text:
            errors.append("jp online batch still loops list_missing URLs")

    if en_lib.is_file():
        text = en_lib.read_text(encoding="utf-8")
        if "COUNT(*)" in text:
            errors.append("en fill-next-candidate must not COUNT")
        if "pickNextEnVocabFillCandidate" not in text:
            errors.append("en fill-next-candidate missing pick function")

    if jp_lib.is_file():
        text = jp_lib.read_text(encoding="utf-8")
        if "COUNT(*)" in text:
            errors.append("jp fill-next-candidate must not COUNT")
        if "pickNextJpVocabFillCandidate" not in text:
            errors.append("jp fill-next-candidate missing pick function")

    if errors:
        print("check_vocab_fill_next_candidate.py FAILED:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print("check_vocab_fill_next_candidate.py OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
