#!/usr/bin/env python3
"""回归：全站顶栏页面字号（Provider + 控件在「刷新」左侧；偏好不进部署清缓存）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    "lib": ROOT / "src/lib/page-font-scale.ts",
    "provider": ROOT / "src/contexts/PageFontScaleProvider.tsx",
    "control": ROOT / "src/components/PageFontScaleControl.tsx",
    "appshell": ROOT / "src/components/AppShell.tsx",
    "navdrawer": ROOT / "src/components/NavDrawer.tsx",
    "providers": ROOT / "src/components/Providers.tsx",
    "globals_base": ROOT / "src/app/globals/globals-base.css",
    "deploy_version": ROOT / "src/lib/app-deploy-version.ts",
    "feature_index": ROOT / "docs/feature-index.md",
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

    lib = FILES["lib"].read_text(encoding="utf-8")
    for needle in (
        'PAGE_FONT_SCALE_STORAGE_KEY = "iq-page-font-scale"',
        "PAGE_FONT_SCALE_PERCENT",
        "applyPageFontScale",
        '"sm"',
        '"md"',
        '"lg"',
        '"xl"',
    ):
        if needle not in lib:
            errors.append(f"page-font-scale.ts missing {needle!r}")

    provider = FILES["provider"].read_text(encoding="utf-8")
    if "applyPageFontScale" not in provider:
        errors.append("PageFontScaleProvider must applyPageFontScale")
    if "writePageFontScale" not in provider:
        errors.append("PageFontScaleProvider must persist via writePageFontScale")

    control = FILES["control"].read_text(encoding="utf-8")
    if "A−" not in control or "A+" not in control:
        errors.append("PageFontScaleControl must show A− / A+")
    if "usePageFontScale" not in control:
        errors.append("PageFontScaleControl must use usePageFontScale")

    providers = FILES["providers"].read_text(encoding="utf-8")
    if "PageFontScaleProvider" not in providers:
        errors.append("Providers must wrap PageFontScaleProvider")

    appshell = FILES["appshell"].read_text(encoding="utf-8")
    if "PageFontScaleControl" not in appshell:
        errors.append("AppShell must render PageFontScaleControl")
    # 「刷新」最右：控件出现在 DeployCacheRefreshButton 之前
    idx_font = appshell.find("<PageFontScaleControl")
    idx_refresh = appshell.find("<DeployCacheRefreshButton")
    if idx_font < 0 or idx_refresh < 0 or idx_font > idx_refresh:
        errors.append(
            "AppShell: PageFontScaleControl must be left of DeployCacheRefreshButton"
        )

    navdrawer = FILES["navdrawer"].read_text(encoding="utf-8")
    if "PageFontScaleControl" not in navdrawer:
        errors.append("NavDrawer must render PageFontScaleControl")
    idx_font_d = navdrawer.find("<PageFontScaleControl")
    idx_refresh_d = navdrawer.find("<DeployCacheRefreshButton")
    if idx_font_d < 0 or idx_refresh_d < 0 or idx_font_d > idx_refresh_d:
        errors.append(
            "NavDrawer: PageFontScaleControl must appear before DeployCacheRefreshButton"
        )

    globals_base = FILES["globals_base"].read_text(encoding="utf-8")
    if ".iq-page-font-scale" not in globals_base:
        errors.append("globals-base.css must style .iq-page-font-scale")

    deploy_version = FILES["deploy_version"].read_text(encoding="utf-8")
    if "iq-page-font-scale" in deploy_version:
        errors.append(
            "iq-page-font-scale must NOT be in APP_DEPLOY_CLIENT_CACHE_PREFIXES "
            "(deploy refresh must keep font preference)"
        )

    feature_index = FILES["feature_index"].read_text(encoding="utf-8")
    if "顶栏页面字号" not in feature_index or "check_page_font_scale.py" not in feature_index:
        errors.append("feature-index.md must document 顶栏页面字号 + check script")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1

    print("OK: page font scale (AppShell left of refresh, localStorage, not cleared on deploy)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
