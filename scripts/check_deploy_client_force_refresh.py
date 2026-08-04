#!/usr/bin/env python3
"""回归：部署后客户端强制拉新代码（version API + watcher + predeploy 写戳）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    "version_lib": ROOT / "src/lib/app-deploy-version.ts",
    "generated": ROOT / "src/lib/app-deploy-version.generated.ts",
    "writer": ROOT / "scripts/write_app_deploy_version.py",
    "predeploy": ROOT / "scripts/predeploy-clean.py",
    "api": ROOT / "src/app/api/app-deploy-version/route.ts",
    "watcher": ROOT / "src/components/DeployVersionWatcher.tsx",
    "providers": ROOT / "src/components/Providers.tsx",
    "wait": ROOT / "scripts/wait_deploy_result.py",
    "rule": ROOT / ".cursor/rules/deploy-client-force-refresh.mdc",
    "hook": ROOT / ".cursor/hooks/deploy-client-refresh-session.py",
    "hooks_json": ROOT / ".cursor/hooks.json",
}


def main() -> int:
    errors: list[str] = []

    for key, path in FILES.items():
        if not path.is_file():
            errors.append(f"missing {key}: {path.relative_to(ROOT)}")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1

    writer = FILES["writer"].read_text(encoding="utf-8")
    if "APP_DEPLOY_VERSION" not in writer or "app-deploy-version.generated.ts" not in writer:
        errors.append("write_app_deploy_version.py must emit generated APP_DEPLOY_VERSION")

    predeploy = FILES["predeploy"].read_text(encoding="utf-8")
    if "write_app_deploy_version" not in predeploy:
        errors.append("predeploy-clean.py must call write_app_deploy_version before build")

    api = FILES["api"].read_text(encoding="utf-8")
    if "no-store" not in api:
        errors.append("app-deploy-version API must send Cache-Control: no-store")
    if "APP_DEPLOY_VERSION" not in api:
        errors.append("API must return baked APP_DEPLOY_VERSION")

    watcher = FILES["watcher"].read_text(encoding="utf-8")
    if "location.reload" not in watcher:
        errors.append("DeployVersionWatcher must location.reload on version mismatch")
    if "APP_DEPLOY_CLIENT_CACHE_PREFIXES" not in watcher:
        errors.append("watcher must clear jp-api:/en-api: caches before reload")
    if "visibilitychange" not in watcher:
        errors.append("watcher must recheck on visibilitychange")
    if "isAppDeployReloadHeld" not in watcher:
        errors.append("watcher must defer reload while app-deploy-reload-hold is active")
    if "subscribeAppDeployReloadHold" not in watcher:
        errors.append("watcher must flush pending reload when hold releases")
    if "60_000" not in FILES["version_lib"].read_text(encoding="utf-8"):
        errors.append("poll interval must be >= 60s (Workers daily quota)")

    hold = ROOT / "src/lib/app-deploy-reload-hold.ts"
    if not hold.is_file():
        errors.append("missing app-deploy-reload-hold.ts")
    else:
        hold_txt = hold.read_text(encoding="utf-8")
        if "holdAppDeployReload" not in hold_txt or "isAppDeployReloadHeld" not in hold_txt:
            errors.append("hold lib must export holdAppDeployReload + isAppDeployReloadHeld")

    for hook_name in (
        "src/hooks/useJpVocabTeacherQuiz.ts",
        "src/hooks/useEnVocabTeacherQuiz.ts",
    ):
        hook = (ROOT / hook_name).read_text(encoding="utf-8")
        if "useHoldAppDeployReloadWhile" not in hook:
            errors.append(f"{hook_name} must hold deploy reload while quiz/preview card open")

    providers = FILES["providers"].read_text(encoding="utf-8")
    if "DeployVersionWatcher" not in providers:
        errors.append("Providers must mount DeployVersionWatcher")

    wait = FILES["wait"].read_text(encoding="utf-8")
    if "app-deploy-version" not in wait and "verify_app_deploy_version" not in wait:
        errors.append("wait_deploy_result.py must verify live /api/app-deploy-version after success")
    if "User-Agent" not in wait or "Mozilla" not in wait:
        errors.append("wait_deploy verify must send browser User-Agent (CF blocks Python-urllib → 403/1010)")

    rule = FILES["rule"].read_text(encoding="utf-8")
    if "DeployVersionWatcher" not in rule or "alwaysApply: true" not in rule:
        errors.append("deploy-client-force-refresh.mdc must alwaysApply and name DeployVersionWatcher")

    hooks_json = FILES["hooks_json"].read_text(encoding="utf-8")
    if "deploy-client-refresh-session.py" not in hooks_json:
        errors.append("hooks.json sessionStart must include deploy-client-refresh-session.py")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1

    print("ok: deploy client force-refresh (version stamp + watcher + predeploy + hook)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
