#!/usr/bin/env python3
"""回归：补全类定时任务须登记 fill_content，维护中心列表须渲染。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from maintenance_center.cron_tasks.registry import CRON_TASKS  # noqa: E402

# id 含 fill 或标题/描述明显是词条补全 → 必须有 fill_content
REQUIRED_IDS = {
    "jp-vocab-fill-unified",
    "jp-vocab-fill-reading",
    "jp-vocab-fill-pos",
    "jp-vocab-fill-pos-online",
    "jp-vocab-fill-related-compounds-online",
    "jp-vocab-fill-single-usage-examples-online",
    "jp-vocab-fill-examples",
    "en-vocab-fill",
}


def main() -> int:
    by_id = {t.id: t for t in CRON_TASKS}
    for tid in sorted(REQUIRED_IDS):
        task = by_id.get(tid)
        if task is None:
            raise SystemExit(f"FAIL: missing cron task {tid}")
        if not task.fill_content:
            raise SystemExit(
                f"FAIL: {tid} 须填 fill_content（维护中心列表「补全内容」）"
            )
        pub = task.to_public_dict()
        if not pub.get("fill_content_label"):
            raise SystemExit(f"FAIL: {tid} fill_content_label empty")

    unified = by_id["jp-vocab-fill-unified"]
    if "相关构词" not in unified.fill_content:
        raise SystemExit(
            "FAIL: jp-vocab-fill-unified.fill_content 须含「相关构词」"
        )
    if "口语频率" not in unified.fill_content or "考试频率" not in unified.fill_content:
        raise SystemExit(
            "FAIL: jp-vocab-fill-unified.fill_content 须含「口语频率」「考试频率」"
            "（常规定时与读音/释义等同持久写回）"
        )
    rc = by_id["jp-vocab-fill-related-compounds-online"]
    sue = by_id["jp-vocab-fill-single-usage-examples-online"]
    if sue.fill_content != ("例句",):
        raise SystemExit(
            f"FAIL: single-usage-examples-online fill_content={sue.fill_content!r}"
        )

    if rc.fill_content != ("相关构词",):
        raise SystemExit(
            f"FAIL: related-compounds-online fill_content={rc.fill_content!r}"
        )

    app_js = (ROOT / "scripts/maintenance_center/static/app.js").read_text(
        encoding="utf-8"
    )
    if "fill_content_label" not in app_js:
        raise SystemExit("FAIL: app.js 须渲染 fill_content_label")
    if "补全内容：" not in app_js:
        raise SystemExit("FAIL: app.js 须展示「补全内容：」")
    css = (ROOT / "scripts/maintenance_center/static/app.css").read_text(
        encoding="utf-8"
    )
    if ".cron-task-fill" not in css:
        raise SystemExit("FAIL: app.css 须有 .cron-task-fill")

    status_py = (
        ROOT / "scripts/maintenance_center/cron_tasks/status.py"
    ).read_text(encoding="utf-8")
    if 'fill_content_label' not in status_py:
        raise SystemExit("FAIL: status.py snapshot 须带 fill_content_label")

    hook = ROOT / ".cursor/hooks/remind-cron-fill-content-after-edit.py"
    if not hook.is_file():
        raise SystemExit("FAIL: missing afterFileEdit hook for cron fill_content")
    hooks_json = (ROOT / ".cursor/hooks.json").read_text(encoding="utf-8")
    if "remind-cron-fill-content-after-edit.py" not in hooks_json:
        raise SystemExit("FAIL: hooks.json 未注册 remind-cron-fill-content-after-edit")
    if "cron-fill-content-session.py" not in hooks_json:
        raise SystemExit("FAIL: hooks.json 未注册 cron-fill-content-session")

    print("[check_cron_fill_content] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
