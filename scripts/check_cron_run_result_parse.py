#!/usr/bin/env python3
"""回归：维护中心已完成记录应从日志解析「结果数据」，勿被 .err.log 槽超时盖住。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from maintenance_center.cron_tasks.runs import (  # noqa: E402
    _summary_from_log,
    extract_result_from_log,
)


SAMPLE_SUCCESS = """
===== com.infoquests.en-vocab-fill-examples.log =====
2026-07-20 06:12:29 en-vocab-fill-examples: start Beijing=2026-07-20 07:12:29
2026-07-20 06:12:29 en-vocab-fill-examples: try ollama slot (wait 0s)…
[ollama_slot] 已占用 owner=en-vocab-fill-examples pid=91982
[en-vocab-fill-examples] list_missing=1 total_missing=13
  [1/1] id=24 word='event'
    ok model=gemma4:26b preview='It was a sudden event.'
[en-vocab-fill-examples] apply updated=1 skipped=0 source=本地 gemma4:26b
[ollama_slot] 已释放 owner=en-vocab-fill-examples
2026-07-20 06:13:19 en-vocab-fill-examples: done
===== com.infoquests.en-vocab-fill-examples.err.log =====
[ollama_slot] Ollama 槽等待超时 (0s)；当前占用=jp-vocab-fill-examples(pid=83478)
===== end =====
"""

SAMPLE_SKIP = """
===== out.log =====
2026-07-20 05:44:52 en-vocab-fill-examples: start Beijing=2026-07-20 06:44:51
[en-vocab-fill-examples] list_missing=1 total_missing=15
  [1/1] id=21 word='concern'
    skip reason=missing_chinese_gloss
  无可写回（skipped=1）
2026-07-20 05:58:53 en-vocab-fill-examples: done
===== out.err.log =====
[ollama_slot] Ollama 槽等待超时 (0s)；当前占用=jp-vocab-fill-examples(pid=1)
"""

SAMPLE_BUSY = """
===== out.log =====
2026-07-20 06:05:55 en-vocab-fill-examples: start Beijing=2026-07-20 07:05:55
2026-07-20 06:05:55 en-vocab-fill-examples: try ollama slot (wait 0s)…
2026-07-20 06:05:55 en-vocab-fill-examples: ollama slot busy, skip (next minute)
2026-07-20 06:05:55 en-vocab-fill-examples: done
"""

SAMPLE_JP_UNIFIED = """
2026-07-29 21:45:03 jp-vocab-fill-unified: start backend=1 stage=unified
  [1/1] id=34 kind=word word='イギリス' full_bundle=['reading', 'meaning', 'pos', 'example_sentences']
    got={'reading': 'イギリス', 'meaning': '英国'}
    applied=['reading', 'word_bundle'] source=线上 claude-sonnet-4-6
2026-07-29 21:45:40 jp-vocab-fill-unified: done
"""


def main() -> int:
    r = extract_result_from_log(SAMPLE_SUCCESS)
    assert r is not None, "success log should parse"
    assert r.get("outcome") == "applied", r
    assert r.get("updated") == 1, r
    assert r.get("items") and r["items"][0]["word"] == "event", r
    summary = _summary_from_log(SAMPLE_SUCCESS, exit_code=0)
    assert "updated=1" in summary or "event" in summary, summary
    assert "槽等待超时" not in summary, summary

    r2 = extract_result_from_log(SAMPLE_SKIP)
    assert r2 and r2.get("outcome") == "nothing_to_write", r2
    assert r2.get("skipped") == 1, r2

    r3 = extract_result_from_log(SAMPLE_BUSY)
    assert r3 and r3.get("outcome") == "slot_busy", r3

    r4 = extract_result_from_log(SAMPLE_JP_UNIFIED)
    assert r4 and r4.get("outcome") == "applied", r4
    assert r4.get("items") and r4["items"][0]["word"] == "イギリス", r4

    print("ok: cron run result parse")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
