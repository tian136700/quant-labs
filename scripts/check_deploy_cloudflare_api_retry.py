#!/usr/bin/env python3
"""Regression: Cloudflare API 502/503/504 deploy failures must auto-retry."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GQC = ROOT / "git-quick-commit.py"
RULE = ROOT / ".cursor" / "rules" / "deploy-cloudflare-api-retry.mdc"

SAMPLE_502 = """
OpenNext build complete.
[worker-size] Worker gzip: 2662.19 KiB
✨ Success! Uploaded 18 files
✘ [ERROR] Received a malformed response from the API
  <!DOCTYPE html>
  POST /accounts/abc/workers/scripts/quant-labs/versions -> 502
  Cloudflare Ray ID: a2901ba2d9887dbb-BKK
ERROR Wrangler deploy command failed:
"""

SAMPLE_403 = """
✘ [ERROR] Received a malformed response from the API
  POST /accounts/abc/workers/scripts/quant-labs/versions -> 403
  Sorry, you have been blocked
"""

SAMPLE_TS = """
Type error: Property 'x' does not exist on type 'Y'.
Failed to compile.
"""


def fail(msg: str) -> int:
    print(f"[check_deploy_cloudflare_api_retry] FAIL: {msg}", file=sys.stderr)
    return 1


def load_gqc():
    spec = importlib.util.spec_from_file_location("git_quick_commit", GQC)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {GQC}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    if not GQC.is_file():
        return fail("missing git-quick-commit.py")
    if not RULE.is_file():
        return fail("missing .cursor/rules/deploy-cloudflare-api-retry.mdc")

    rule = RULE.read_text(encoding="utf-8")
    for needle in (
        "is_cloudflare_api_transient_deploy_failure",
        "cf:deploy",
        "502",
        "CF_DEPLOY_API_RETRIES",
    ):
        if needle not in rule:
            return fail(f"rule must mention {needle!r}")

    src = GQC.read_text(encoding="utf-8")
    for needle in (
        "def is_cloudflare_api_transient_deploy_failure",
        "npm\", \"run\", \"cf:deploy\"",
        "CF_DEPLOY_API_RETRIES",
        "cloudflare_deploy_api_retry_delay_sec",
        "import time",
    ):
        if needle not in src:
            return fail(f"git-quick-commit must include {needle!r}")

    if "is_cloudflare_api_transient_deploy_failure(output)" not in src:
        return fail("deploy_to_cloudflare must call transient detector on failed deploy")

    mod = load_gqc()
    detect = mod.is_cloudflare_api_transient_deploy_failure
    if not detect(SAMPLE_502):
        return fail("SAMPLE_502 must be detected as transient")
    if detect(SAMPLE_403):
        return fail("SAMPLE_403 (WAF) must NOT be treated as transient 5xx")
    if detect(SAMPLE_TS):
        return fail("TypeScript compile errors must NOT be treated as transient")
    if detect(""):
        return fail("empty output must not be transient")

    delay1 = mod.cloudflare_deploy_api_retry_delay_sec(1)
    delay2 = mod.cloudflare_deploy_api_retry_delay_sec(2)
    if delay1 < 10 or delay2 <= delay1:
        return fail("retry delay must back off (attempt2 > attempt1, >=10s)")

    print("[check_deploy_cloudflare_api_retry] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
