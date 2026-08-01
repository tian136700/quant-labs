#!/usr/bin/env python3
"""Regression: SSE must not blind-reload; must reclaim slots so UI can open.

Symptoms:
- 维护中心「刷两下就一直闪」—— onerror → 盲 location.reload 死循环
- 「一直转圈进不去」——僵尸订阅占满 MAX_SSE_CLIENTS → 新页 503
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_JS = ROOT / "scripts" / "maintenance_center" / "static" / "app.js"
SERVER_PY = ROOT / "scripts" / "maintenance_center" / "server.py"
HUB_PY = ROOT / "scripts" / "maintenance_center" / "hub.py"


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

    # 503 / 断线时须 close + 退避重连，禁止只靠原生 EventSource 狂连
    if "failStreak" not in text:
        print(
            "[check_maintenance_center_sse_reload] FAIL: EventSource onerror must close + "
            "backoff reconnect (failStreak)",
            file=sys.stderr,
        )
        return 1
    if "source?.close()" not in text and "source.close()" not in text:
        print(
            "[check_maintenance_center_sse_reload] FAIL: EventSource onerror must close source",
            file=sys.stderr,
        )
        return 1

    if "drop_oldest_subscribers" not in HUB_PY.read_text(encoding="utf-8"):
        print(
            "[check_maintenance_center_sse_reload] FAIL: hub must expose drop_oldest_subscribers",
            file=sys.stderr,
        )
        return 1

    server = SERVER_PY.read_text(encoding="utf-8")
    if "drop_oldest_subscribers" not in server:
        print(
            "[check_maintenance_center_sse_reload] FAIL: /api/events must reclaim via "
            "drop_oldest_subscribers when full",
            file=sys.stderr,
        )
        return 1
    if "is_subscribed" not in server:
        print(
            "[check_maintenance_center_sse_reload] FAIL: SSE loop must exit when unsubscribed",
            file=sys.stderr,
        )
        return 1
    if "q.get(timeout=25)" in server or "timeout=25" in server:
        print(
            "[check_maintenance_center_sse_reload] FAIL: SSE keepalive timeout still 25s "
            "(zombies linger too long)",
            file=sys.stderr,
        )
        return 1

    # 有界队列才能在 Full 时剔除慢客户端
    hub = HUB_PY.read_text(encoding="utf-8")
    if "Queue(maxsize=" not in hub:
        print(
            "[check_maintenance_center_sse_reload] FAIL: subscribe() must use bounded Queue",
            file=sys.stderr,
        )
        return 1

    print("[check_maintenance_center_sse_reload] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
