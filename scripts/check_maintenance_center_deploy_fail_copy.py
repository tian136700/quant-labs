#!/usr/bin/env python3
"""Regression: 部署失败时页顶显示红色「复制失败日志」；成功则隐藏。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_JS = ROOT / "scripts/maintenance_center/static/app.js"
INDEX = ROOT / "scripts/maintenance_center/static/index.html"
CSS = ROOT / "scripts/maintenance_center/static/app.css"


def main() -> int:
    errors: list[str] = []
    js = APP_JS.read_text(encoding="utf-8")
    html = INDEX.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")

    if 'id="deploy-fail-banner"' not in html:
        errors.append("index.html missing #deploy-fail-banner")
    if 'id="deploy-fail-copy"' not in html:
        errors.append("index.html missing #deploy-fail-copy")
    if "复制失败日志" not in html:
        errors.append("index.html missing label 复制失败日志")
    if ".deploy-fail-banner" not in css:
        errors.append("app.css missing .deploy-fail-banner")
    if "position: sticky" not in css and "position:sticky" not in css.replace(" ", ""):
        # allow either spacing
        if "sticky" not in css.split("deploy-fail-banner", 1)[-1][:400]:
            errors.append("deploy-fail-banner should be position:sticky at page top")
    if "function updateDeployFailBanner" not in js:
        errors.append("app.js missing updateDeployFailBanner")
    if "function resolveDeployFailCopyTarget" not in js:
        errors.append("app.js missing resolveDeployFailCopyTarget")
    if "function copyDeployFailLog" not in js:
        errors.append("app.js missing copyDeployFailLog")
    if "function formatDeployFailAgentPrompt" not in js:
        errors.append("app.js missing formatDeployFailAgentPrompt")
    if "防止类似事情再次发生" not in js and "防复发" not in js:
        errors.append(
            "deploy fail copy AI prompt must ask to fix + prevent recurrence"
        )
    if "含 AI 提示" not in js:
        errors.append("copyDeployFailLog toast must mention 含 AI 提示")
    if "含 AI 提示词" not in html:
        errors.append("deploy-fail-copy button title should mention 含 AI 提示词")
    if 'status === "error"' not in js:
        errors.append("fail banner must key off status === error")
    if 'status === "success"' not in js:
        errors.append("expected success status handling still present")
    # 成功不得常显：仅 error 时设 hidden=false
    if "banner.hidden = false" not in js:
        errors.append("banner must unhide on failure")
    if "banner.hidden = true" not in js:
        errors.append("banner must hide when not failed")
    if 'deploy-fail-copy")?.addEventListener' not in js and (
        'deploy-fail-copy")?.addEventListener' not in js.replace(" ", "")
    ):
        if 'el("deploy-fail-copy")' not in js:
            errors.append("app.js must bind click on #deploy-fail-copy")

    if errors:
        print("check_maintenance_center_deploy_fail_copy: FAIL", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1
    print("check_maintenance_center_deploy_fail_copy: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
