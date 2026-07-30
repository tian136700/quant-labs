#!/usr/bin/env python3
"""回归：维护中心「词条补全 · 最近词条」日语/英语日志解析 + API 快照。"""

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

    feed = __import__(
        "maintenance_center.jp_vocab_fill_feed",
        fromlist=[
            "jp_vocab_fill_feed_snapshot",
            "insert_jp_vocab_fill_word_run",
            "list_jp_vocab_fill_word_runs",
        ],
    )
    snap = feed.jp_vocab_fill_feed_snapshot(limit=5)
    assert snap.get("ok") is True, snap
    assert "recent" in snap and "current" in snap, snap
    for row in snap.get("recent") or []:
        assert row.get("status") not in ("running", "applying"), row

    # 维护中心须有独立顶栏「词条补全」（原日语补全），词条卡不在定时任务页里
    index_html = (ROOT / "scripts/maintenance_center/static/index.html").read_text(
        encoding="utf-8"
    )
    app_js = (ROOT / "scripts/maintenance_center/static/app.js").read_text(encoding="utf-8")
    if 'data-view="view-jp-fill"' not in index_html:
        raise SystemExit("FAIL: missing top tab data-view=view-jp-fill")
    if "词条补全" not in index_html:
        raise SystemExit("FAIL: top tab should be renamed to 词条补全")
    if 'id="view-jp-fill"' not in index_html:
        raise SystemExit("FAIL: missing section#view-jp-fill")
    if 'id="vocab-fill-feed-card"' not in index_html and 'id="jp-vocab-fill-feed-card"' not in index_html:
        raise SystemExit("FAIL: missing vocab-fill-feed-card")
    if 'id="vocab-fill-circuit-alert"' not in index_html:
        raise SystemExit("FAIL: missing red circuit alert on 词条补全 page")
    if "renderVocabFillCircuitAlert" not in app_js:
        raise SystemExit("FAIL: renderVocabFillCircuitAlert missing (熔断须红字提示)")
    if "因熔断停机" not in app_js:
        raise SystemExit("FAIL: schedule line must mention 因熔断停机 when killed")
    if 'data-fill-lang="jp"' not in index_html or 'data-fill-lang="en"' not in index_html:
        raise SystemExit("FAIL: missing 日语/英语 language tabs")
    if 'id="vocab-fill-panel-en"' not in index_html or 'id="en-fill-feed-rows"' not in index_html:
        raise SystemExit("FAIL: missing English fill panel")
    # 词条卡须在 view-jp-fill 内，不在 view-cron 内
    cron_chunk = index_html.split('id="view-cron"', 1)[1].split('id="view-jp-fill"', 1)[0]
    if "vocab-fill-feed-card" in cron_chunk or "jp-vocab-fill-feed-card" in cron_chunk:
        raise SystemExit("FAIL: jp-fill feed still embedded under view-cron")
    if "function isJpFillViewActive" not in app_js:
        raise SystemExit("FAIL: isJpFillViewActive missing in app.js")
    if 'name === "view-jp-fill"' not in app_js:
        raise SystemExit("FAIL: activate must refresh on view-jp-fill")
    if "jp-fill-word-copy" not in app_js or "data-copy-word" not in app_js:
        raise SystemExit("FAIL: word copy button missing in jp-fill feed")
    if 'button.jp-fill-word-copy[data-copy-word]' not in app_js:
        raise SystemExit("FAIL: jp-fill word copy click handler missing")
    if "已复制：${word}" not in app_js:
        raise SystemExit("FAIL: jp-fill word copy toast must show which word was copied")
    if 'id="jp-fill-interval"' not in index_html:
        raise SystemExit("FAIL: missing jp-fill-interval select")
    if 'id="en-fill-interval"' not in index_html:
        raise SystemExit("FAIL: missing en-fill-interval select")
    if 'id="jp-fill-interval-save"' not in index_html:
        raise SystemExit("FAIL: missing jp-fill-interval-save button")
    if "saveJpFillInterval" not in app_js and "saveVocabFillInterval" not in app_js:
        raise SystemExit("FAIL: saveJpFillInterval/saveVocabFillInterval missing in app.js")
    if "/api/jp-vocab-fill/interval" not in app_js:
        raise SystemExit("FAIL: interval API call missing in app.js")
    if "/api/en-vocab-fill/interval" not in app_js:
        raise SystemExit("FAIL: EN interval API call missing in app.js")
    if "jpFillIntervalDirty" not in app_js:
        raise SystemExit("FAIL: jpFillIntervalDirty guard missing (select jumps on poll)")
    if "document.activeElement === select" not in app_js:
        raise SystemExit("FAIL: must skip refresh while interval select focused")
    # 禁止轮询里重建 select.innerHTML（会关菜单/跳）
    if "function syncJpFillIntervalSelect" not in app_js:
        raise SystemExit("FAIL: syncJpFillIntervalSelect missing")
    if "function setJpFillIntervalMsg" not in app_js:
        raise SystemExit("FAIL: setJpFillIntervalMsg missing")
    sync_chunk = app_js.split("function syncJpFillIntervalSelect", 1)[1].split(
        "function setJpFillIntervalMsg", 1
    )[0]
    if "innerHTML" in sync_chunk:
        raise SystemExit("FAIL: syncJpFillIntervalSelect must not rewrite select.innerHTML")
    # 真正改 select 的实现也禁止 innerHTML 重建选项
    sync_impl = app_js.split("function syncVocabFillIntervalSelect", 1)
    if len(sync_impl) > 1:
        impl_chunk = sync_impl[1].split("function setVocabFillIntervalMsg", 1)[0]
        if "innerHTML" in impl_chunk:
            raise SystemExit("FAIL: syncVocabFillIntervalSelect must not rewrite select.innerHTML")

    from maintenance_center.jp_vocab_fill_interval import (  # noqa: E402
        ALLOWED_INTERVALS,
        DEFAULT_INTERVAL,
        format_interval_label,
        interval_snapshot,
    )

    assert 60 in ALLOWED_INTERVALS and DEFAULT_INTERVAL == 180, ALLOWED_INTERVALS
    assert format_interval_label(60) == "1 分钟"
    snap_iv = interval_snapshot()
    assert "interval_seconds" in snap_iv and "allowed_intervals" in snap_iv, snap_iv
    assert snap.get("interval_seconds") is not None, snap
    assert "allowed_intervals" in snap, snap

    server_py = (ROOT / "scripts/maintenance_center/server.py").read_text(encoding="utf-8")
    if 'path == "/api/jp-vocab-fill/interval"' not in server_py:
        raise SystemExit("FAIL: POST /api/jp-vocab-fill/interval missing in server.py")
    if "set_unified_interval" not in server_py:
        raise SystemExit("FAIL: set_unified_interval not wired in server.py")
    if 'path == "/api/jp-vocab-fill/pause"' not in server_py:
        raise SystemExit("FAIL: POST /api/jp-vocab-fill/pause missing in server.py")
    if 'path == "/api/jp-vocab-fill/resume"' not in server_py:
        raise SystemExit("FAIL: POST /api/jp-vocab-fill/resume missing in server.py")
    if 'path == "/api/en-vocab-fill/recent"' not in server_py:
        raise SystemExit("FAIL: GET /api/en-vocab-fill/recent missing in server.py")
    if 'path == "/api/en-vocab-fill/interval"' not in server_py:
        raise SystemExit("FAIL: POST /api/en-vocab-fill/interval missing in server.py")
    if 'path == "/api/en-vocab-fill/pause"' not in server_py:
        raise SystemExit("FAIL: POST /api/en-vocab-fill/pause missing in server.py")
    if 'path == "/api/en-vocab-fill/resume"' not in server_py:
        raise SystemExit("FAIL: POST /api/en-vocab-fill/resume missing in server.py")
    if 'id="jp-fill-pause"' not in index_html or 'id="jp-fill-resume"' not in index_html:
        raise SystemExit("FAIL: pause/resume buttons missing in index.html")
    if 'id="en-fill-pause"' not in index_html or 'id="en-fill-resume"' not in index_html:
        raise SystemExit("FAIL: EN pause/resume buttons missing in index.html")
    if "postJpFillPauseOrResume" not in app_js and "postVocabFillPauseOrResume" not in app_js:
        raise SystemExit("FAIL: postJpFillPauseOrResume missing in app.js")
    if "paused" not in snap:
        raise SystemExit("FAIL: feed snapshot must include paused")

    from maintenance_center.en_vocab_fill_feed import (  # noqa: E402
        parse_en_vocab_fill_log,
        en_vocab_fill_feed_snapshot,
        insert_en_vocab_fill_word_run,
        list_en_vocab_fill_word_runs,
    )

    sample_en = """
2026-07-30 07:00:00 en-vocab-fill-online: start Beijing=2026-07-30
  [1/1] id=151 word='special' full_refresh=['reading', 'meaning']
    got={'reading': '/ˈspɛʃ.əl/'}
    applied=['reading', 'meaning'] source=线上 claude-sonnet-4-6
2026-07-30 07:00:10 en-vocab-fill-online: done
"""
    en_completed, en_current = parse_en_vocab_fill_log(sample_en)
    assert len(en_completed) == 1 and en_completed[0]["word_id"] == 151, en_completed
    assert en_completed[0]["status"] == "success", en_completed[0]
    assert en_current is None, en_current
    en_snap = en_vocab_fill_feed_snapshot(limit=5)
    assert en_snap.get("ok") is True and "recent" in en_snap, en_snap
    assert en_snap.get("task_id") == "en-vocab-fill", en_snap
    assert "paused" in en_snap, en_snap

    en_rid = insert_en_vocab_fill_word_run(
        {
            "word_id": 900151,
            "word": "special-test",
            "kind": "word",
            "status": "running",
            "started_at": "2099-01-01 00:00:00",
        }
    )
    en_rid2 = insert_en_vocab_fill_word_run(
        {
            "word_id": 900151,
            "word": "special-test",
            "kind": "word",
            "status": "success",
            "source": "线上 test",
            "applied": "['reading']",
            "finished_at": "2099-01-01 00:00:12",
        }
    )
    assert en_rid == en_rid2, (en_rid, en_rid2)
    en_rows = [
        r
        for r in list_en_vocab_fill_word_runs(limit=20)
        if int(r.get("word_id") or 0) == 900151
    ]
    assert len(en_rows) == 1 and en_rows[0]["status"] == "success", en_rows

    # 同词 running→success 应 UPDATE 成一行，不留下「生成中」幽灵行
    rid = feed.insert_jp_vocab_fill_word_run(
        {
            "word_id": 900034,
            "word": "テスト英国",
            "kind": "word",
            "status": "running",
            "started_at": "2099-01-01 00:00:00",
        }
    )
    rid2 = feed.insert_jp_vocab_fill_word_run(
        {
            "word_id": 900034,
            "word": "テスト英国",
            "kind": "word",
            "status": "success",
            "source": "线上 test",
            "applied": "['word_bundle']",
            "finished_at": "2099-01-01 00:00:12",
        }
    )
    assert rid == rid2, (rid, rid2)
    rows = [
        r
        for r in feed.list_jp_vocab_fill_word_runs(limit=20)
        if int(r.get("word_id") or 0) == 900034
    ]
    assert len(rows) == 1 and rows[0]["status"] == "success", rows

    # 清掉测试脏数据
    from maintenance_center.db import get_conn, init_db

    init_db()
    with get_conn() as conn:
        conn.execute("DELETE FROM jp_vocab_fill_word_runs WHERE word_id = ?", (900034,))
        conn.execute("DELETE FROM en_vocab_fill_word_runs WHERE word_id = ?", (900151,))

    print("[check_jp_vocab_fill_feed] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
