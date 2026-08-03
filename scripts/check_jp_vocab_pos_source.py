#!/usr/bin/env python3
"""回归：日语词性补全写 pos_source + 词表展示来源角标 + 他动词/自动词。"""

from __future__ import annotations

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
    pos_ai = (ROOT / "src/lib/jp-vocab-pos-ai.ts").read_text(encoding="utf-8")
    batch = (ROOT / "scripts/jp-vocab-fill-online-batch-api.py").read_text(
        encoding="utf-8"
    )
    meaning_api = (ROOT / "scripts/jp-vocab-fill-meaning-api.py").read_text(
        encoding="utf-8"
    )
    meaning_ai = (ROOT / "src/lib/jp-vocab-meaning-ai.ts").read_text(encoding="utf-8")

    if "pos_source = COALESCE(?2, pos_source)" not in fill_pos:
        raise SystemExit("FAIL: fill-pos apply must write pos_source")
    if 'source?: string' not in route and "body.source" not in route:
        raise SystemExit("FAIL: fill-pos route must accept source")
    if "source: batchSource || null" not in route and "source: batchSource" not in route:
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

    # 他动词 / 自动词：prompt + 白名单须同时放开，否则模型写了也会被 normalize 丢掉
    for label, text in (
        ("pos-ai", pos_ai),
        ("pos-online", online),
        ("online-batch", batch),
        ("meaning-ai", meaning_ai),
        ("meaning-api", meaning_api),
    ):
        if "他动词" not in text or "自动词" not in text:
            raise SystemExit(f"FAIL: {label} must mention 他动词/自动词")
    token_chunk = pos_ai.split("POS_TOKEN_RE", 1)[-1][:500]
    if "他动词" not in token_chunk or "自动词" not in token_chunk:
        raise SystemExit("FAIL: POS_TOKEN_RE must allow 他动词/自动词")
    if "不分" not in pos_ai and "拿不准" not in pos_ai:
        raise SystemExit("FAIL: pos prompt must say unclear → 动词")
    if '"他动词"' not in online:
        raise SystemExit("FAIL: pos-online ALLOWED_POS must include 他动词")
    if '"自动词"' not in online:
        raise SystemExit("FAIL: pos-online ALLOWED_POS must include 自动词")

    print("[check_jp_vocab_pos_source] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
