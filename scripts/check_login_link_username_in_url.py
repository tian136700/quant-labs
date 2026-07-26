#!/usr/bin/env python3
"""Regression: admin login links must embed username in the URL path."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> int:
    print(f"[check_login_link_username_in_url] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    slug_path = ROOT / "src/lib/login-link-slug.ts"
    slug = slug_path.read_text(encoding="utf-8")
    if "encodeURIComponent(name)" not in slug:
        return fail("loginLinkPath must encode username into /sign-in/{username}/{slug}")
    if "username?: string | null" not in slug:
        return fail("buildLoginLinkUrl / loginLinkPath must accept username")

    # Next.js: sibling dynamic segments must share the same param name.
    # /sign-in/[slug] + /sign-in/[username]/… → whole-site 500 ("slug !== username").
    conflicting = ROOT / "src/app/sign-in/[slug]"
    if conflicting.exists():
        return fail(
            "remove src/app/sign-in/[slug] — conflicts with [username] "
            "(Next: You cannot use different slug names for the same dynamic path)"
        )

    single = ROOT / "src/app/sign-in/[username]/route.ts"
    if not single.is_file():
        return fail("missing /sign-in/[username] route (legacy one-segment slug)")
    single_text = single.read_text(encoding="utf-8")
    if "normalizeLoginLinkToken" not in single_text:
        return fail("legacy /sign-in/[username] must auth by slug token")

    route = ROOT / "src/app/sign-in/[username]/[slug]/route.ts"
    if not route.is_file():
        return fail("missing /sign-in/[username]/[slug] route")
    route_text = route.read_text(encoding="utf-8")
    if "normalizeLoginLinkToken(slug)" not in route_text:
        return fail("username/slug route must auth by slug only")

    api = (ROOT / "src/app/api/admin/users/login-link/route.ts").read_text(
        encoding="utf-8"
    )
    if "result.username" not in api:
        return fail("login-link API must pass result.username into buildLoginLinkUrl")

    db = (ROOT / "src/lib/etr-login-link-db.ts").read_text(encoding="utf-8")
    if "username: user.username" not in db:
        return fail("createLoginLink must return username")

    tmpl = (ROOT / "src/lib/login-link-template-render.ts").read_text(encoding="utf-8")
    if "{username}" not in tmpl:
        return fail("renderLoginLinkTemplate must support {username}")

    print("[check_login_link_username_in_url] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
