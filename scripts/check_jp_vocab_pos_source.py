#!/usr/bin/env python3
"""回归：日语词性补全写 pos_source + 词表展示来源角标。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    fill_pos = (ROOT / "src/lib/jp-vocab-fill-pos.ts").read_text(encoding="utf-8")
    route = (ROOT / "src/app/api/jp-vocab/fill-pos/route.ts").read_text(encoding="utf-8")
    meaning = (ROOT / "src/lib/jp-vocab-fill-meaning.ts").read_text(encoding="utf-8")
    table = (
        ROOT / "src/components/jp-vocab-page/JpVocabWordTable.tsx"
    ).read_text(encoding="utf-8")
    notes = (ROOT / "src/lib/jp-vocab-db/notes_fields.ts").read_text(encoding="utf-8")
    online = (
        ROOT / "scripts/jp-vocab-fill-pos-online-api.py"
    ).read_text(encoding="utf-8")

    if "pos_source = COALESCE(?2, pos_source)" not in fill_pos:
        raise SystemExit("FAIL: fill-pos apply must write pos_source")
    if 'source?: string' not in route and "body.source" not in route:
        raise SystemExit("FAIL: fill-pos route must accept source")
    if "source: batchSource || null" not in route and "source: batchSource" not in route:
        # route passes source into apply
        if "source: batchSource || null" not in route:
            if "source:" not in route or "batchSource" not in route:
                raise SystemExit("FAIL: fill-pos route must pass batch source to apply")
    if "pos_source = CASE" not in meaning:
        raise SystemExit("FAIL: fill-meaning must write pos_source when writing pos")
    if "source={w.pos_source}" not in table and "source={w.pos_source}" not in table.replace(
        " ", ""
    ):
        if "w.pos_source" not in table:
            raise SystemExit("FAIL: JpVocabWordTable must show JpVocabSourceLabel for pos")
    if "JpVocabSourceLabel" not in table or "pos_source" not in table:
        raise SystemExit("FAIL: missing pos source label in word table")
    if "pos_source = ?6" not in notes and "pos_source = ?7" not in notes:
        raise SystemExit("FAIL: notes_fields must persist pos_source on edit")
    if '"source": source' not in online and "'source': source" not in online:
        raise SystemExit("FAIL: pos-online script must send source on apply")

    print("[check_jp_vocab_pos_source] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
