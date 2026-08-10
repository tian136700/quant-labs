#!/usr/bin/env python3
"""Regression: any hub deploy must be visible as「正在部署」in maintenance center UI.

Guards against the recurrence where Agent POST (mode=manual) left the default
「自动部署」tab idle, so the user thought the hub was broken.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_JS = ROOT / "scripts/maintenance_center/static/app.js"
INDEX = ROOT / "scripts/maintenance_center/static/index.html"
CSS = ROOT / "scripts/maintenance_center/static/app.css"
SERVER = ROOT / "scripts/maintenance_center/server.py"
RULE = ROOT / ".cursor/rules/maintenance-center-deploy-visible.mdc"


def main() -> int:
    errors: list[str] = []

    for path, label in (
        (APP_JS, "app.js"),
        (INDEX, "index.html"),
        (CSS, "app.css"),
        (SERVER, "server.py"),
        (RULE, "rule"),
    ):
        if not path.is_file():
            errors.append(f"missing {label}: {path}")

    if errors:
        print("check_maintenance_center_deploy_visible: FAIL", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    js = APP_JS.read_text(encoding="utf-8")
    html = INDEX.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")
    server = SERVER.read_text(encoding="utf-8")
    rule = RULE.read_text(encoding="utf-8")

    if 'id="deploy-running-banner"' not in html:
        errors.append("index.html missing #deploy-running-banner")
    if "正在部署" not in html:
        errors.append("index.html missing 正在部署 label")
    if 'id="deploy-running-goto"' not in html:
        errors.append("index.html missing #deploy-running-goto")

    if ".deploy-running-banner" not in css:
        errors.append("app.css missing .deploy-running-banner")
    if "position: sticky" not in css and "position:sticky" not in css.replace(" ", ""):
        if "sticky" not in css.split("deploy-running-banner", 1)[-1][:400]:
            errors.append("deploy-running-banner should be position:sticky")

    if "function updateDeployRunningBanner" not in js:
        errors.append("app.js missing updateDeployRunningBanner")
    if "function resolveDeployRunningTarget" not in js:
        errors.append("app.js missing resolveDeployRunningTarget")
    if 'el("deploy-running-goto")' not in js:
        errors.append("app.js must bind #deploy-running-goto")

    # auto page must mirror any running hub job (not only mode=auto)
    if "hub_status == \"running\"" not in server and "hub_status == 'running'" not in server:
        # allow either quote style after strip
        if 'hub_status == "running"' not in server.replace("'", '"'):
            errors.append(
                "server.py auto_runtime_snapshot must surface hub when status==running "
                "(any mode)"
            )
    if "mode_label" not in server or "进行中" not in server:
        errors.append("server.py _runtime_from_hub should label 自动/手动部署进行中")

    if "alwaysApply: true" not in rule:
        errors.append("deploy-visible rule must be alwaysApply")
    if "/api/manual/publish" not in rule:
        errors.append("rule must point at /api/manual/publish")
    if "npm run deploy" not in rule:
        errors.append("rule must forbid bypass npm run deploy")

    if errors:
        print("check_maintenance_center_deploy_visible: FAIL", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("check_maintenance_center_deploy_visible: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
