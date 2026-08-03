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
    if "熔断已停" not in app_js and "因熔断停机" not in app_js:
        raise SystemExit("FAIL: schedule line must mention 熔断已停 when killed")
    if "未运行" not in app_js:
        raise SystemExit("FAIL: schedule line must use human label 未运行 (not 未加载)")
    if "定时状态：未加载" in app_js:
        raise SystemExit("FAIL: must not show 定时状态：未加载")
    # 禁止含糊「定时状态：正在运行」——须点名统一补全，并与临时词性区分
    if "function vocabFillScheduleLine" not in app_js:
        raise SystemExit("FAIL: vocabFillScheduleLine missing")
    if "日语统一补全" not in app_js or "${name}定时" not in app_js:
        raise SystemExit("FAIL: schedule line must name 日语统一补全定时 (not vague 定时状态)")
    if "按间隔唤醒补下一词" not in app_js:
        raise SystemExit("FAIL: scheduled idle must say 按间隔唤醒补下一词")
    if "最近一轮无待补词条" not in app_js:
        raise SystemExit("FAIL: empty wake must say 最近一轮无待补词条 (not look like stuck)")
    if "下方表只记实际补过的词" not in app_js:
        raise SystemExit("FAIL: empty wake must clarify table only logs filled words")
    if "已跑完并停掉" in app_js:
        raise SystemExit("FAIL: 临时词性已跑完勿再展示「已跑完并停掉」摘要行")
    if "vocab-fill-panel-sub" in index_html:
        raise SystemExit("FAIL: remove vocab-fill-panel-sub help paragraphs")
    if "日语统一补全与英语整词补全：正在跑哪个" in index_html:
        raise SystemExit("FAIL: remove card-level help paragraph on 词条补全")
    if "定时状态：" in app_js:
        raise SystemExit("FAIL: must not use vague label 定时状态： (name the task)")
    if "开始运行" not in index_html or "开始运行" not in app_js:
        raise SystemExit("FAIL: 未运行时须有「开始运行」按钮")
    if "launchd_loaded" not in app_js or "circuitKilled" not in app_js:
        raise SystemExit("FAIL: 开始运行按钮须按 launchd_loaded / 熔断切换显示")
    jp_iv = (ROOT / "scripts/maintenance_center/jp_vocab_fill_interval.py").read_text(
        encoding="utf-8"
    )
    if "cleared_circuit" not in jp_iv or "resume_fill_launchd" not in jp_iv:
        raise SystemExit("FAIL: 开始运行须能解除熔断（resume_unified → resume_fill_launchd）")
    if "copyCircuitDiag" not in app_js or 'id="vocab-fill-circuit-copy"' not in index_html:
        raise SystemExit("FAIL: 熔断红字条须有复制诊断信息按钮")
    if "renderVocabFillCurrentBox" not in app_js or "isVocabFillWaitingCurrent" not in app_js:
        raise SystemExit("FAIL: 正在处理须区分「查询下一词」与真实词条")
    if "等待 list_missing" in app_js:
        raise SystemExit("FAIL: UI 不得再展示 list_missing 技术占位")
    jp_feed = (ROOT / "scripts/maintenance_center/jp_vocab_fill_feed.py").read_text(encoding="utf-8")
    en_feed = (ROOT / "scripts/maintenance_center/en_vocab_fill_feed.py").read_text(encoding="utf-8")
    if "def last_wake_from_log" not in jp_feed or "def last_wake_from_log" not in en_feed:
        raise SystemExit("FAIL: jp/en feed must expose last_wake_from_log")
    if '"last_wake"' not in jp_feed or '"last_wake"' not in en_feed:
        raise SystemExit("FAIL: feed snapshot must include last_wake")
    if "quiz_gate" not in jp_feed or "quiz_gate" not in en_feed:
        raise SystemExit("FAIL: last_wake_from_log must detect quiz_gate skips")
    if "quiz_gate" not in app_js or "抽查门禁跳过" not in app_js:
        raise SystemExit(
            "FAIL: vocabFillScheduleLine must surface quiz_gate (not stale 无待补)"
        )
    if "抽查冷却中" not in jp_feed or "抽查进行中" not in jp_feed:
        raise SystemExit("FAIL: jp feed quiz_gate labels must mention 抽查冷却/进行中")
    from maintenance_center.jp_vocab_fill_feed import (  # noqa: E402
        last_wake_from_log as jp_last_wake,
    )

    quiz_wake = jp_last_wake(
        "\n".join(
            [
                "2026-08-02 06:00:34 jp-vocab-fill-unified: start backend=1 stage=unified",
                "[jp-vocab-fill-online] 无待补词条",
                "2026-08-02 06:00:57 jp-vocab-fill-unified: done",
                "[jp-vocab-fill-unified] quiz gate quiet → skip reason=quiz_cooldown detail=x",
                "2026-08-02 06:34:18 jp-vocab-fill-unified: quiz gate skip (helper exit 75)",
            ]
        )
    )
    if quiz_wake.get("result") != "quiz_gate":
        raise SystemExit(f"FAIL: quiz skip must beat stale empty wake, got {quiz_wake!r}")
    if "抽查冷却" not in str(quiz_wake.get("label") or ""):
        raise SystemExit(f"FAIL: quiz_cooldown label missing, got {quiz_wake!r}")
    if '"（等待 list_missing' in jp_feed or '"（等待 list_missing' in en_feed:
        raise SystemExit("FAIL: feed 不得把 list_missing 塞进 word 字段")
    if "waiting_list" not in jp_feed or "waiting_list" not in en_feed:
        raise SystemExit("FAIL: feed 查询下一词须用 status=waiting_list")
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
    if "jp-fill-fail-copy" not in app_js or "formatVocabFillFailLog" not in app_js:
        raise SystemExit("FAIL: failed-row copy-log button missing in vocab fill feed")
    if 'button.jp-fill-fail-copy[data-fill-row-idx]' not in app_js:
        raise SystemExit("FAIL: jp-fill fail-log copy click handler missing")
    if "已复制失败日志" not in app_js:
        raise SystemExit("FAIL: fail-log copy toast must confirm copy")
    if "【词条补全失败】" not in app_js or "错误：" not in app_js:
        raise SystemExit("FAIL: fail-log text must include title + error line")
    # 一键复制：只拷未处理失败（已处理/已删除不进）；含表外旧失败 unresolved_fails
    if "formatVocabFillAllFailLogs" not in app_js or "copyVocabFillAllFailLogs" not in app_js:
        raise SystemExit("FAIL: missing one-click copy-all-fail-logs helpers")
    if "vocabFillRowIsUnresolvedFail" not in app_js:
        raise SystemExit("FAIL: one-click must filter unresolved fails only")
    if "unresolved_fails" not in app_js:
        raise SystemExit("FAIL: one-click must prefer API unresolved_fails")
    if "jp-fill-copy-all-fails" not in index_html or "en-fill-copy-all-fails" not in index_html:
        raise SystemExit("FAIL: missing #jp/#en-fill-copy-all-fails buttons in index.html")
    if "一键复制失败日志" not in index_html:
        raise SystemExit("FAIL: copy-all-fails button label missing")
    if "copyAllFails" not in app_js or "syncVocabFillCopyAllFailsBtn" not in app_js:
        raise SystemExit("FAIL: copyAllFails must be wired in VOCAB_FILL_LANGS + synced on render")
    if "未处理失败" not in app_js:
        raise SystemExit("FAIL: copy-all toast/title must say 未处理失败")
    if "resolved_later" not in app_js or "jp-fill-badge--resolved" not in app_js:
        raise SystemExit("FAIL: failed-row must show green 已处理 when resolved_later")
    if "已处理" not in app_js:
        raise SystemExit("FAIL: resolved badge label 已处理 missing")
    if "jp-fill-badge--resolved" not in (
        ROOT / "scripts/maintenance_center/static/app.css"
    ).read_text(encoding="utf-8"):
        raise SystemExit("FAIL: resolved badge CSS missing")
    resolved_mod = (
        ROOT / "scripts/maintenance_center/vocab_fill_resolved_later.py"
    ).read_text(encoding="utf-8")
    if "annotate_rows_resolved_later" not in resolved_mod:
        raise SystemExit("FAIL: missing annotate_rows_resolved_later helper")
    if "select_unresolved_fail_rows" not in resolved_mod:
        raise SystemExit("FAIL: missing select_unresolved_fail_rows for one-click scope")
    if "list_jp_vocab_fill_unresolved_fails" not in jp_feed:
        raise SystemExit("FAIL: jp feed must list unresolved_fails for one-click copy")
    if "list_en_vocab_fill_unresolved_fails" not in en_feed:
        raise SystemExit("FAIL: en feed must list unresolved_fails for one-click copy")
    if '"unresolved_fails"' not in jp_feed or '"unresolved_fails"' not in en_feed:
        raise SystemExit("FAIL: jp/en feed snapshot must include unresolved_fails")
    if "annotate_rows_resolved_later" not in jp_feed or "annotate_rows_resolved_later" not in en_feed:
        raise SystemExit("FAIL: jp/en feed must annotate resolved_later")
    from maintenance_center.vocab_fill_resolved_later import (  # noqa: E402
        annotate_rows_resolved_later,
        select_unresolved_fail_rows,
    )

    resolved_sample = annotate_rows_resolved_later(
        [
            {
                "word_id": 513,
                "status": "success",
                "finished_at": "2026-08-01 13:52:05",
            },
            {
                "word_id": 513,
                "status": "failed",
                "finished_at": "2026-08-01 13:45:44",
            },
            {
                "word_id": 999,
                "status": "failed",
                "finished_at": "2026-08-01 12:00:00",
            },
        ]
    )
    assert resolved_sample[1].get("resolved_later") is True, resolved_sample[1]
    assert resolved_sample[1].get("resolved_label") == "已处理", resolved_sample[1]
    assert not resolved_sample[2].get("resolved_later"), resolved_sample[2]
    only_unresolved = select_unresolved_fail_rows(resolved_sample)
    assert len(only_unresolved) == 1 and only_unresolved[0]["word_id"] == 999, only_unresolved
    deleted_only = select_unresolved_fail_rows(
        annotate_rows_resolved_later(
            [
                {
                    "word_id": 540,
                    "status": "success",
                    "finished_at": "2026-08-04 03:20:00",
                    "preview": "此词条已被删除。已并入原形",
                },
                {
                    "word_id": 540,
                    "status": "failed",
                    "finished_at": "2026-08-03 23:00:00",
                },
            ]
        )
    )
    assert deleted_only == [], deleted_only
    if 'RESOLVED_LATER_LABEL = "已处理"' not in resolved_mod:
        raise SystemExit("FAIL: RESOLVED_LATER_LABEL must be 已处理")
    if 'RESOLVED_DELETED_LABEL = "此词条已被删除"' not in resolved_mod:
        raise SystemExit("FAIL: RESOLVED_DELETED_LABEL must be 此词条已被删除")
    deleted_sample = annotate_rows_resolved_later(
        [
            {
                "word_id": 540,
                "status": "success",
                "finished_at": "2026-08-04 03:20:00",
                "preview": "此词条已被删除。已并入原形",
            },
            {
                "word_id": 540,
                "status": "failed",
                "finished_at": "2026-08-03 23:00:00",
            },
        ]
    )
    assert deleted_sample[1].get("resolved_later") is True, deleted_sample[1]
    assert deleted_sample[1].get("resolved_label") == "此词条已被删除", deleted_sample[1]
    mark_helper = ROOT / "scripts/lib/vocab_fill_mark_resolved.py"
    if not mark_helper.is_file():
        raise SystemExit("FAIL: missing scripts/lib/vocab_fill_mark_resolved.py")
    mark_txt = mark_helper.read_text(encoding="utf-8")
    if "mark_resolved" not in mark_txt or "word-runs" not in mark_txt:
        raise SystemExit("FAIL: mark_resolved helper must POST word-runs")
    if "--resolved-label" not in mark_txt or "此词条已被删除" not in mark_txt:
        raise SystemExit("FAIL: mark_resolved must support deleted resolved-label")
    for hook_rel in (
        ".cursor/hooks/vocab-fill-resolved-session.py",
        ".cursor/hooks/remind-vocab-fill-resolved.py",
        ".cursor/hooks/remind-vocab-fill-resolved-after-shell.py",
    ):
        if not (ROOT / hook_rel).is_file():
            raise SystemExit(f"FAIL: missing {hook_rel}")
    hooks_json = (ROOT / ".cursor/hooks.json").read_text(encoding="utf-8")
    for needle in (
        "vocab-fill-resolved-session.py",
        "remind-vocab-fill-resolved.py",
        "remind-vocab-fill-resolved-after-shell.py",
    ):
        if needle not in hooks_json:
            raise SystemExit(f"FAIL: hooks.json must wire {needle}")
    if 'id="jp-fill-interval"' not in index_html:
        raise SystemExit("FAIL: missing jp-fill-interval select")
    if "补全内容" not in index_html:
        raise SystemExit("FAIL: 最近词条表须有「补全内容」列（任务类型+字段）")
    if "fill_content_label" not in app_js:
        raise SystemExit("FAIL: 表格须渲染 fill_content_label")
    if "vocab_fill_applied_label" not in (
        ROOT / "scripts/maintenance_center/jp_vocab_fill_feed.py"
    ).read_text(encoding="utf-8"):
        raise SystemExit("FAIL: jp feed 须用 vocab_fill_applied_label")
    from maintenance_center.vocab_fill_applied_label import (  # noqa: E402
        format_fill_content_label,
    )

    sample_label = format_fill_content_label(
        lang="jp",
        applied="['reading', 'word_bundle', 'example_sentences', 'related_compounds']",
        fill_task="jp-vocab-fill-unified",
    )
    if (
        "统一补全" not in sample_label
        or "读音" not in sample_label
        or "相关构词" not in sample_label
    ):
        raise SystemExit(f"FAIL: fill content label bad: {sample_label!r}")
    from maintenance_center.vocab_fill_applied_label import (  # noqa: E402
        _APPLIED_LABELS,
    )

    if _APPLIED_LABELS.get("related_compounds") != "相关构词":
        raise SystemExit("FAIL: related_compounds must map to 相关构词")
    pos_label = format_fill_content_label(
        lang="jp", applied="['pos']", fill_task="jp-vocab-fill-pos-online"
    )
    if "临时词性" not in pos_label or "词性" not in pos_label:
        raise SystemExit(f"FAIL: pos fill content label bad: {pos_label!r}")
    rc_label = format_fill_content_label(
        lang="jp",
        applied="['related_compounds']",
        fill_task="jp-vocab-fill-related-compounds-online",
    )
    if "临时相关构词" not in rc_label or "相关构词" not in rc_label:
        raise SystemExit(f"FAIL: related compounds fill content label bad: {rc_label!r}")
    feed_py = (ROOT / "scripts/maintenance_center/jp_vocab_fill_feed.py").read_text(
        encoding="utf-8"
    )
    if "related_compounds_online" not in feed_py:
        raise SystemExit("FAIL: jp_vocab_fill_feed missing related_compounds_online")
    if "临时相关构词" not in app_js:
        raise SystemExit("FAIL: app.js missing 临时相关构词 summary")
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
    content = str(rows[0].get("fill_content_label") or "")
    if "释义/词性" not in content:
        raise SystemExit(f"FAIL: success row missing fill_content_label: {rows[0]}")

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
