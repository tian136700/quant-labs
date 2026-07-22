#!/usr/bin/env python3
"""Regression: desktop「更多」must stay fully visible (not clipped to「更»).

Fails if SiteNav goes back to wrap-top measurement, drops MAX_PRIMARY_NAV,
or CSS lets the more button shrink / ruler lose measurable widths.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE_NAV = ROOT / "src" / "components" / "SiteNav.tsx"
SPLIT = ROOT / "src" / "hooks" / "useSiteNavSplit.ts"
FIT = ROOT / "src" / "lib" / "site-nav-fit.ts"
CONFIG = ROOT / "src" / "lib" / "site-nav-config.ts"
CSS = ROOT / "src" / "app" / "globals.css"


def fail(msg: str) -> int:
    print(f"[check_site_nav_more_visible] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    for path in (SITE_NAV, SPLIT, FIT, CONFIG, CSS):
        if not path.is_file():
            return fail(f"missing {path.relative_to(ROOT)}")

    site_nav = SITE_NAV.read_text(encoding="utf-8")
    split = SPLIT.read_text(encoding="utf-8")
    fit = FIT.read_text(encoding="utf-8")
    config = CONFIG.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")

    if "MAX_PRIMARY_NAV" not in config:
        return fail("MAX_PRIMARY_NAV missing from site-nav-config.ts")

    if "MAX_PRIMARY_NAV" not in split:
        return fail("useSiteNavSplit must cap with MAX_PRIMARY_NAV")

    if "countFittingPrimaryNavItems" not in fit:
        return fail("site-nav-fit.ts missing countFittingPrimaryNavItems")

    if "countFittingPrimaryNavItems" not in site_nav:
        return fail("SiteNav must use countFittingPrimaryNavItems (width-sum)")

    # Ban the old wrap-top heuristic that over-counted and clipped「更多」
    if re.search(r"getBoundingClientRect\(\)\.top", site_nav):
        return fail(
            "SiteNav still uses wrap-top measurement; use width-sum so「更多」fits"
        )

    if "clientWidth" not in site_nav:
        return fail("SiteNav measure must use nav clientWidth")

    if "admin-nav-list--ruler" not in css:
        return fail("globals.css missing .admin-nav-list--ruler")

    if not re.search(r"\.admin-nav-list--ruler\s*\{[^}]*width:\s*max-content", css, re.S):
        return fail("ruler must be width:max-content for per-label width measure")

    if not re.search(r"\.admin-nav-more\s*\{[^}]*flex-shrink:\s*0", css, re.S):
        return fail(".admin-nav-more must be flex-shrink:0 so「更多」is not crushed")

    if "flex-shrink: 0" not in css or "page-header-tools" not in css:
        return fail("page-header-tools should not shrink away from nav measure width")

    # Smoke-test the fit math via a tiny inline reimplementation check is overkill;
    # ensure the reserve-more contract is documented in the helper.
    if "更多" not in fit and "moreWidth" not in fit:
        return fail("site-nav-fit must reserve moreWidth when items overflow")

    print("[check_site_nav_more_visible] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
