#!/usr/bin/env python3
"""D1 配额诊断看板：路由、面板、后台入口、fill catch 接线。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

REQUIRED = [
    SRC / "app/admin/d1-quota/page.tsx",
    SRC / "app/api/analytics/d1-quota/route.ts",
    SRC / "components/admin-dashboard/AdminD1QuotaPanel.tsx",
    SRC / "lib/d1-quota-db.ts",
    SRC / "lib/vocab-fill-route-error.ts",
]

FILL_ROUTES = list((SRC / "app/api/jp-vocab").glob("fill-*/route.ts")) + list(
    (SRC / "app/api/en-vocab").glob("fill-*/route.ts")
)


def main() -> int:
    errors: list[str] = []

    for path in REQUIRED:
        if not path.is_file():
            errors.append(f"missing file: {path.relative_to(ROOT)}")

    dash = SRC / "components/AdminDashboardPage.tsx"
    dash_text = dash.read_text(encoding="utf-8")
    if "adminD1QuotaPath" not in dash_text:
        errors.append("AdminDashboardPage missing adminD1QuotaPath link")

    locale = SRC / "lib/locale-path.ts"
    if "adminD1QuotaPath" not in locale.read_text(encoding="utf-8"):
        errors.append("locale-path missing adminD1QuotaPath")

    types = SRC / "i18n/messages/types.ts"
    if "adminD1Quota:" not in types.read_text(encoding="utf-8"):
        errors.append("i18n types missing adminD1Quota")

    for route in sorted(FILL_ROUTES):
        text = route.read_text(encoding="utf-8")
        if "vocabFillRouteErrorResponse" not in text:
            errors.append(
                f"fill route missing vocabFillRouteErrorResponse: {route.relative_to(ROOT)}"
            )

    nav = SRC / "lib/nav-href.ts"
    nav_text = nav.read_text(encoding="utf-8")
    if '"adminD1Quota"' not in nav_text:
        errors.append("nav-href missing adminD1Quota target")

    if errors:
        print("check_d1_quota_dashboard.py FAILED:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print("check_d1_quota_dashboard.py OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
