#!/usr/bin/env python3
"""Regression: expired wrangler OAuth must not count as deploy-ready."""

from __future__ import annotations

import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / "scripts" / "lib" / "wrangler_deploy_auth.py"
GQC = ROOT / "git-quick-commit.py"
FEATURE_HOOK = ROOT / ".cursor" / "hooks" / "feature-remark-stop.py"
RETRY_LIB = ROOT / "scripts" / "lib" / "next_document_deploy_retry.py"
RULE = ROOT / ".cursor" / "rules" / "wrangler-deploy-auth.mdc"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not LIB.is_file():
        fail(f"missing {LIB.relative_to(ROOT)}")
    lib_src = LIB.read_text(encoding="utf-8")
    if "def probe_wrangler_oauth_refresh" not in lib_src:
        fail("wrangler_deploy_auth must probe refresh before treating expired oauth as dead")
    sys.path.insert(0, str(ROOT / "scripts"))
    from lib.wrangler_deploy_auth import (  # noqa: E402
        env_file_has_cloudflare_api_token,
        is_wrangler_noninteractive_auth_failure,
        local_deploy_auth_ready,
        wrangler_oauth_config_usable,
        wrangler_oauth_expired_hint,
    )

    now = datetime(2026, 8, 15, 6, 40, tzinfo=timezone.utc)
    expired = (
        'oauth_token = "x"\n'
        'expiration_time = "2026-08-14T18:25:27.884Z"\n'
        'refresh_token = "y"\n'
    )
    fresh = (
        'oauth_token = "x"\n'
        'expiration_time = "2026-08-16T18:25:27.884Z"\n'
    )
    if wrangler_oauth_config_usable(expired, now=now):
        fail("expired oauth_token must not be treated as usable")
    if not wrangler_oauth_config_usable(fresh, now=now):
        fail("unexpired oauth_token must still be usable")
    if not wrangler_oauth_config_usable('api_token = "x"\n', now=now):
        fail("static api_token in wrangler config must be usable")
    if wrangler_oauth_config_usable("", now=now):
        fail("empty config must not be usable")
    hint = wrangler_oauth_expired_hint(expired)
    if "npx wrangler login" not in hint:
        fail("expired hint must tell the operator to run npx wrangler login")
    if "oauth/callback" not in hint and "回调" not in hint:
        fail("expired hint must warn that wrangler login must keep listening")
    if "oauth_token" in hint or "refresh_token" in hint:
        fail("expired hint must not include token field values")

    tmp = Path(tempfile.mkdtemp())
    cfg = tmp / "default.toml"
    cfg.write_text(expired, encoding="utf-8")
    ready, why = local_deploy_auth_ready(
        env_token="",
        env_file=tmp / "missing.env",
        config_paths=[cfg],
        probe=lambda: False,
    )
    if ready:
        fail("expired oauth with failed refresh probe must not be ready")
    if "npx wrangler login" not in why:
        fail("failed refresh must still tell operator to wrangler login")
    ready, why = local_deploy_auth_ready(
        env_token="",
        env_file=tmp / "missing.env",
        config_paths=[cfg],
        probe=lambda: True,
    )
    if not ready:
        fail("expired oauth with successful refresh probe must be ready")
    if "refreshed" not in why:
        fail("successful probe hint must say refreshed")

    if env_file_has_cloudflare_api_token("# CLOUDFLARE_API_TOKEN=secret\n"):
        fail("commented CLOUDFLARE_API_TOKEN must not count as present")
    if not env_file_has_cloudflare_api_token("CLOUDFLARE_API_TOKEN=secret\n"):
        fail("uncommented CLOUDFLARE_API_TOKEN must count as present")

    auth_log = (
        "In a non-interactive environment, it's necessary to set a "
        "CLOUDFLARE_API_TOKEN environment variable for wrangler to work."
    )
    if not is_wrangler_noninteractive_auth_failure(auth_log):
        fail("missing-token log must count as wrangler auth failure")
    if is_wrangler_noninteractive_auth_failure(
        "POST /accounts/abc/workers/scripts/x/versions -> 502"
    ):
        fail("CF 502 must not count as wrangler auth failure")

    if GQC.is_file():
        gqc = GQC.read_text(encoding="utf-8")
        if "local_deploy_auth_ready" not in gqc and "wrangler_oauth_config_usable" not in gqc:
            fail("git-quick-commit.py must call wrangler auth helpers")
        if 'if "oauth_token" in text or "api_token" in text:' in gqc:
            fail(
                "git-quick-commit must not treat any oauth_token file as ready "
                "(expired sessions still have that key)"
            )

    feature = FEATURE_HOOK.read_text(encoding="utf-8")
    if "local_deploy_auth_ready" not in feature:
        fail("feature-remark-stop must gate on local_deploy_auth_ready")
    retry = RETRY_LIB.read_text(encoding="utf-8")
    if "is_wrangler_noninteractive_auth_failure" not in retry:
        fail("next_document_deploy_retry must exclude wrangler auth from transient republish")
    if not RULE.is_file():
        fail("missing wrangler-deploy-auth.mdc")

    sys.path.insert(0, str(ROOT / "scripts"))
    from lib.next_document_deploy_retry import (  # noqa: E402
        is_deploy_transient_republish_failure,
    )

    if is_deploy_transient_republish_failure(auth_log):
        fail("wrangler auth failure must not auto-republish as transient")

    print("OK: expired wrangler OAuth is not deploy-ready")


if __name__ == "__main__":
    main()
