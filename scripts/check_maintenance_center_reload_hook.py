#!/usr/bin/env python3
"""回归：维护中心改动后应有 reload 脚本 + afterFileEdit 钩子。"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOOKS = ROOT / ".cursor" / "hooks.json"
RELOAD = ROOT / "scripts" / "maintenance_center" / "reload_publish_console.py"
HOOK_PY = ROOT / ".cursor" / "hooks" / "maintenance-center-reload-after-edit.py"
WATCH = ROOT / "scripts" / "publish-console-watch.py"


def main() -> int:
    if not RELOAD.is_file():
        print("FAIL: missing reload_publish_console.py", file=sys.stderr)
        return 1
    if not HOOK_PY.is_file():
        print("FAIL: missing maintenance-center-reload-after-edit.py", file=sys.stderr)
        return 1
    data = json.loads(HOOKS.read_text(encoding="utf-8"))
    after = data.get("hooks", {}).get("afterFileEdit", [])
    ids = [h.get("command", "") for h in after if isinstance(h, dict)]
    if not any("maintenance-center-reload-after-edit" in str(c) for c in ids):
        print("FAIL: hooks.json missing maintenance-center-reload hook", file=sys.stderr)
        return 1
    watch = WATCH.read_text(encoding="utf-8")
    if "_collect_maintenance_center_watch_files" not in watch:
        print("FAIL: publish-console-watch missing glob watch", file=sys.stderr)
        return 1
    sys.path.insert(0, str(ROOT / "scripts"))
    from maintenance_center.reload_publish_console import request_reload  # noqa: E402

    r = request_reload()
    if not r.get("ok"):
        print("FAIL: request_reload", r, file=sys.stderr)
        return 1
    print("[check_maintenance_center_reload_hook] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
