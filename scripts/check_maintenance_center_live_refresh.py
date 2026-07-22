#!/usr/bin/env python3
"""Regression guard: maintenance center UI must always poll auto/manual status.

Fails if app.js only refreshes auto when lastAutoData.status === "running"
while SSE is OPEN — that leaves the page stuck on the previous success
(Bark fires, UI shows stale times).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_JS = ROOT / "scripts" / "maintenance_center" / "static" / "app.js"


def main() -> int:
    if not APP_JS.is_file():
        print(f"[check_maintenance_center_live_refresh] FAIL: missing {APP_JS}", file=sys.stderr)
        return 1

    text = APP_JS.read_text(encoding="utf-8")

    if "function refreshAllLiveSnapshots" not in text:
        print(
            "[check_maintenance_center_live_refresh] FAIL: refreshAllLiveSnapshots missing",
            file=sys.stderr,
        )
        return 1

    if "visibilitychange" not in text:
        print(
            "[check_maintenance_center_live_refresh] FAIL: visibilitychange refresh missing",
            file=sys.stderr,
        )
        return 1

    # Extract the main 2s setInterval body (first setInterval after EventSource)
    es_pos = text.find("new EventSource")
    if es_pos < 0:
        print("[check_maintenance_center_live_refresh] FAIL: EventSource missing", file=sys.stderr)
        return 1

    after_es = text[es_pos:]
    m = re.search(r"setInterval\(\s*\(\)\s*=>\s*\{", after_es)
    if not m:
        print(
            "[check_maintenance_center_live_refresh] FAIL: post-EventSource setInterval missing",
            file=sys.stderr,
        )
        return 1

    # Grab a window of the first setInterval body
    body_start = es_pos + m.end()
    window = text[body_start : body_start + 1200]

    if "void refreshManual()" not in window and "refreshManual()" not in window:
        print(
            "[check_maintenance_center_live_refresh] FAIL: 2s poll must call refreshManual()",
            file=sys.stderr,
        )
        return 1
    if "void refreshAuto()" not in window and "refreshAuto()" not in window:
        print(
            "[check_maintenance_center_live_refresh] FAIL: 2s poll must call refreshAuto()",
            file=sys.stderr,
        )
        return 1

    # Anti-pattern: refreshAuto only inside lastAutoData?.status === "running"
    gated_only = re.search(
        r"if\s*\(\s*lastAutoData\?\.status\s*===\s*[\"']running[\"']\s*\)\s*\{[^}]*refreshAuto\(\)",
        window,
        re.DOTALL,
    )
    unconditional = re.search(
        r"(?:^|\n)\s*(?:void\s+)?refreshAuto\(\)",
        window,
    )
    # Also OK if refreshAllLiveSnapshots is called unconditionally in the interval
    via_helper = re.search(
        r"(?:^|\n)\s*refreshAllLiveSnapshots\(\)",
        window,
    )
    if gated_only and not unconditional and not via_helper:
        print(
            "[check_maintenance_center_live_refresh] FAIL: refreshAuto gated on "
            "lastAutoData.status==='running' without unconditional poll",
            file=sys.stderr,
        )
        return 1

    # Ensure we still document the contract in-file
    if "不能只在" not in text and "lastAutoData.status" not in text:
        print(
            "[check_maintenance_center_live_refresh] FAIL: missing in-file 防复发 comment",
            file=sys.stderr,
        )
        return 1

    print("[check_maintenance_center_live_refresh] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
