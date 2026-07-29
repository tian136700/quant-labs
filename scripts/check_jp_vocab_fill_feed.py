#!/usr/bin/env python3
"""回归：维护中心「日语补全 · 最近词条」日志解析 + API 快照。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from maintenance_center.cron_tasks.runs import extract_result_from_log  # noqa: E402
from maintenance_center.jp_vocab_fill_feed import (  # noqa: E402
    parse_jp_vocab_fill_log,
)

SAMPLE_UNIFIED = """
2026-07-29 21:45:03 jp-vocab-fill-unified: start backend=1 stage=unified
  [1/1] id=34 kind=word word='イギリス' full_bundle=['reading', 'meaning', 'pos', 'example_sentences']
    got={'reading': 'イギリス', 'meaning': '英国', 'pos': '名词', 'example_sentences': '…(N5)…'}
    applied=['reading', 'word_bundle'] source=线上 claude-sonnet-4-6
2026-07-29 21:45:40 jp-vocab-fill-unified: done
2026-07-29 21:48:03 jp-vocab-fill-unified: start backend=1 stage=unified
  [1/1] id=88 kind=word word='大家' full_bundle=['reading', 'meaning', 'pos', 'example_sentences']
    fail generate: incomplete_bundle:example_sentences
2026-07-29 21:48:20 jp-vocab-fill-unified: done
"""


def main() -> int:
    completed, current = parse_jp_vocab_fill_log(SAMPLE_UNIFIED)
    assert len(completed) == 2, completed
    assert completed[0]["word_id"] == 88 and completed[0]["status"] == "failed", completed[0]
    assert completed[1]["word_id"] == 34 and completed[1]["status"] == "success", completed[1]
    assert current is None, current

    parsed = extract_result_from_log(SAMPLE_UNIFIED.split("2026-07-29 21:48:03")[0])
    assert parsed is not None, "unified success log should parse"
    assert parsed.get("outcome") == "applied", parsed
    assert parsed.get("items") and parsed["items"][0]["word"] == "イギリス", parsed

    parsed_fail = extract_result_from_log(SAMPLE_UNIFIED)
    assert parsed_fail and parsed_fail.get("outcome") == "failed", parsed_fail

    snap = __import__(
        "maintenance_center.jp_vocab_fill_feed",
        fromlist=["jp_vocab_fill_feed_snapshot"],
    ).jp_vocab_fill_feed_snapshot(limit=5)
    assert snap.get("ok") is True, snap
    assert "recent" in snap and "current" in snap, snap

    print("[check_jp_vocab_fill_feed] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
