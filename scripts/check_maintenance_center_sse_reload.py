#!/usr/bin/env python3
"""Regression: SSE onerror must not blind location.reload() when server is up.

Symptom: 维护中心「刷两下就一直闪」—— EventSource 短暂断线 / 占满客户端上限时
onerror → waitForServerAndReload → 只要 started_at 存在就整页 reload → 死循环。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_JS = ROOT / "scripts" / "maintenance_center" / "static" / "app.js"


def main() -> int:
    if not APP_JS.is_file():
        print(f"[check_maintenance_center_sse_reload] FAIL: missing {APP_JS}", file=sys.stderr)
        return 1

    text = APP_JS.read_text(encoding="utf-8")

    m = re.search(
        r"async function waitForServerAndReload\(\)\s*\{(.*?)\n\}",
        text,
        re.DOTALL,
    )
    if not m:
        print(
            "[check_maintenance_center_sse_reload] FAIL: waitForServerAndReload missing",
            file=sys.stderr,
        )
        return 1

    body = m.group(1)

    # Anti-pattern: if (startedAt) location.reload()
    if re.search(r"if\s*\(\s*startedAt\s*\)\s*location\.reload\s*\(", body):
        print(
            "[check_maintenance_center_sse_reload] FAIL: blind location.reload on startedAt "
            "(SSE blip will flash-loop the page)",
            file=sys.stderr,
        )
        return 1

    if "reloadForServerRestart" not in body:
        print(
            "[check_maintenance_center_sse_reload] FAIL: must gate reload via "
            "reloadForServerRestart(startedAt)",
            file=sys.stderr,
        )
        return 1

    if "serverReloadProbeInFlight" not in text:
        print(
            "[check_maintenance_center_sse_reload] FAIL: missing in-flight debounce for probe",
            file=sys.stderr,
        )
        return 1

    print("[check_maintenance_center_sse_reload] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
