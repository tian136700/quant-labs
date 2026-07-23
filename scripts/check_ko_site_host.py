#!/usr/bin/env python3
"""Regression: Korean module must use korean.info-quests.com (not finance/jp/en)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> int:
    print(f"[check_ko_site_host] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    host = ROOT / "src/lib/ko-site-host.ts"
    if not host.is_file():
        return fail("missing src/lib/ko-site-host.ts")
    host_text = host.read_text(encoding="utf-8")
    if "korean.info-quests.com" not in host_text:
        return fail("ko-site-host must default to korean.info-quests.com")
    if "KO_SITE_URL" not in host_text or "KO_SITE_HOST" not in host_text:
        return fail("missing KO_SITE_HOST / KO_SITE_URL exports")

    wrangler = (ROOT / "wrangler.toml").read_text(encoding="utf-8")
    if 'pattern = "korean.info-quests.com"' not in wrangler:
        return fail("wrangler.toml missing korean.info-quests.com route")
    if "NEXT_PUBLIC_KO_SITE_HOST" not in wrangler:
        return fail("wrangler.toml missing NEXT_PUBLIC_KO_SITE_* vars")

    login = (ROOT / "src/lib/login-link-slug.ts").read_text(encoding="utf-8")
    if 'role === "ko_pron"' not in login or 'return "ko"' not in login:
        return fail("loginLinkSiteForRole must map ko_pron → ko")
    if "KO_SITE_URL" not in login:
        return fail("buildLoginLinkUrl must use KO_SITE_URL for ko")

    creds = (ROOT / "src/lib/admin-user-credentials.ts").read_text(encoding="utf-8")
    if "KO_SITE_URL" not in creds:
        return fail("admin-user-credentials must use KO_SITE_URL for ko_pron")
    if "${SITE_URL}${koPronPath()}" in creds:
        return fail("ko_pron share URL must not use finance SITE_URL")
    if "from \"@/lib/site\"" in creds and "SITE_URL" in creds:
        # credentials used to import finance SITE_URL for ko — no longer allowed
        return fail("admin-user-credentials should not import finance SITE_URL")

    zh = (ROOT / "src/lib/zh-forced-host.ts").read_text(encoding="utf-8")
    if "KO_SITE_HOST" not in zh:
        return fail("zh-forced-host must include KO_SITE_HOST")

    layout = (ROOT / "src/app/layout.tsx").read_text(encoding="utf-8")
    if "korean.info-quests.com" not in layout:
        return fail("layout.tsx forced-host bootstrap must include korean")

    print("[check_ko_site_host] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
