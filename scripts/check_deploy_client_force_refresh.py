#!/usr/bin/env python3
"""回归：部署后客户端靠顶栏「刷新」拉新（version API + provider；禁止顶部横幅自动刷）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    "version_lib": ROOT / "src/lib/app-deploy-version.ts",
    "generated": ROOT / "src/lib/app-deploy-version.generated.ts",
    "reload_client": ROOT / "src/lib/app-deploy-reload-client.ts",
    "provider": ROOT / "src/contexts/AppDeployVersionProvider.tsx",
    "cache_btn": ROOT / "src/components/DeployCacheRefreshButton.tsx",
    "writer": ROOT / "scripts/write_app_deploy_version.py",
    "predeploy": ROOT / "scripts/predeploy-clean.py",
    "api": ROOT / "src/app/api/app-deploy-version/route.ts",
    "appshell": ROOT / "src/components/AppShell.tsx",
    "globals_base": ROOT / "src/app/globals/globals-base.css",
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

    reload_client = FILES["reload_client"].read_text(encoding="utf-8")
    if "location.reload" not in reload_client and "window.location.reload" not in reload_client:
        errors.append("app-deploy-reload-client must location.reload on user click")
    if "APP_DEPLOY_CLIENT_CACHE_PREFIXES" not in reload_client:
        errors.append("reload client must clear jp-api:/en-api:/ko-api: caches before reload")

    provider = FILES["provider"].read_text(encoding="utf-8")
    if "visibilitychange" not in provider:
        errors.append("AppDeployVersionProvider must recheck on visibilitychange")
    if "isAppDeployReloadHeld" not in provider:
        errors.append("provider must respect app-deploy-reload-hold (quiz)")
    if "subscribeAppDeployReloadHold" not in provider:
        errors.append("provider must reassert pending when hold releases")
    if "offerManualReload" not in provider:
        errors.append("provider must offer manual reload only (no auto reload)")
    if re.search(
        r"if\s*\(\s*document\.hidden\s*\)[\s\S]{0,400}?reloadForAppDeployVersion\(",
        provider,
    ):
        errors.append("provider must NOT auto-reload when document.hidden")
    if "location.reload" in provider or "reloadNow(" in provider:
        errors.append("provider must not call location.reload directly (use reload client on click)")
    # 禁止恢复顶部横幅状态机
    for banned in ("bannerVisible", "dismissBanner", "showBanner", "iq-deploy-reload-banner"):
        if banned in provider:
            errors.append(f"provider must not keep top banner API ({banned}); only top-right 刷新")

    # 顶部「有新版本 / 点击刷新」横幅组件须已删除
    watcher_path = ROOT / "src/components/DeployVersionWatcher.tsx"
    if watcher_path.is_file():
        errors.append("DeployVersionWatcher.tsx must be removed (top banner cancelled; use 刷新 only)")

    cache_btn = FILES["cache_btn"].read_text(encoding="utf-8")
    if "刷新缓存" in cache_btn:
        errors.append("DeployCacheRefreshButton must NOT label 刷新缓存 (use 刷新)")
    if re.search(r">\s*刷新\s*<", cache_btn) is None:
        errors.append("DeployCacheRefreshButton must label 刷新")
    if "hasUpdate" not in cache_btn or "iq-deploy-cache-refresh--lit" not in cache_btn:
        errors.append("cache button must light when hasUpdate")
    if "iq-deploy-cache-refresh--dim" not in cache_btn:
        errors.append("cache button must dim when no update")
    if "applyPendingReload" not in cache_btn:
        errors.append("cache button click must call applyPendingReload")

    appshell = FILES["appshell"].read_text(encoding="utf-8")
    if "DeployCacheRefreshButton" not in appshell:
        errors.append("AppShell must mount DeployCacheRefreshButton in desktop tools")
    auth_i = appshell.find("<SiteAuthBar")
    btn_i = appshell.find("<DeployCacheRefreshButton")
    if auth_i < 0 or btn_i < 0 or btn_i < auth_i:
        errors.append(
            "AppShell desktop tools: DeployCacheRefreshButton must be after SiteAuthBar (top-right)"
        )

    globals_base = FILES["globals_base"].read_text(encoding="utf-8")
    if "iq-deploy-cache-refresh--lit" not in globals_base:
        errors.append("globals-base.css must style lit cache refresh button")
    if "iq-deploy-cache-refresh--dim" not in globals_base:
        errors.append("globals-base.css must style dim cache refresh button")
    if re.search(
        r"iq-deploy-cache-refresh--dim[^{]*\{[^}]*opacity:\s*0\.[0-4]\d*",
        globals_base,
    ):
        errors.append("dim cache button opacity must stay readable (>=0.5); do not stack to invisible")

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
        "src/components/KoPronPage.tsx",
    ):
        hook = (ROOT / hook_name).read_text(encoding="utf-8")
        if "useHoldAppDeployReloadWhile" not in hook:
            errors.append(f"{hook_name} must hold deploy reload while quiz/preview card open")

    providers = FILES["providers"].read_text(encoding="utf-8")
    if "DeployVersionWatcher" in providers:
        errors.append("Providers must NOT mount DeployVersionWatcher (banner cancelled)")
    if "AppDeployVersionProvider" not in providers:
        errors.append("Providers must wrap with AppDeployVersionProvider")

    wait = FILES["wait"].read_text(encoding="utf-8")
    if "app-deploy-version" not in wait and "verify_app_deploy_version" not in wait:
        errors.append("wait_deploy_result.py must verify live /api/app-deploy-version after success")
    if "User-Agent" not in wait or "Mozilla" not in wait:
        errors.append("wait_deploy verify must send browser User-Agent (CF blocks Python-urllib → 403/1010)")

    rule = FILES["rule"].read_text(encoding="utf-8")
    if "alwaysApply: true" not in rule:
        errors.append("deploy-client-force-refresh.mdc must alwaysApply")
    if "「刷新」" not in rule:
        errors.append("rule must document top-right 刷新 button (lit/dim)")
    if "易误会" not in rule:
        errors.append("rule must warn against cache-sounding button wording")
    if "顶栏" not in rule:
        errors.append("rule must mention 顶栏 for the refresh button")
    if "禁止自动刷" not in rule and "绝不自动" not in rule and "只有用户点" not in rule:
        errors.append("rule must forbid auto reload (manual only)")
    if "可见标签页检测到新版立刻 location.reload" not in rule:
        errors.append("rule must forbid hard reload while tab is visible")
    if "有新版本" not in rule or "点击刷新" not in rule:
        # 规则里须写明禁止恢复横幅（用 ❌ 举例）
        errors.append("rule must document that top 有新版本/点击刷新 banner is cancelled")

    hooks_json = FILES["hooks_json"].read_text(encoding="utf-8")
    if "deploy-client-refresh-session.py" not in hooks_json:
        errors.append("hooks.json sessionStart must include deploy-client-refresh-session.py")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1

    print("ok: deploy client force-refresh (version stamp + provider + 刷新 only + predeploy + hook)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
