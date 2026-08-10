#!/usr/bin/env python3
"""Regression: Cloudflare API 502/503/504 deploy failures must auto-retry."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / "scripts" / "lib" / "cloudflare_deploy_retry.py"
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


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    # Ensure scripts/ is on path when loading git-quick-commit
    scripts = str(ROOT / "scripts")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    if not LIB.is_file():
        return fail("missing scripts/lib/cloudflare_deploy_retry.py")
    if not GQC.is_file():
        return fail("missing git-quick-commit.py (local deploy entry)")
    if not RULE.is_file():
        return fail("missing .cursor/rules/deploy-cloudflare-api-retry.mdc")

    rule = RULE.read_text(encoding="utf-8")
    for needle in (
        "cloudflare_deploy_retry",
        "is_cloudflare_api_transient_deploy_failure",
        "cf:deploy",
        "502",
        "CF_DEPLOY_API_RETRIES",
    ):
        if needle not in rule:
            return fail(f"rule must mention {needle!r}")

    lib_src = LIB.read_text(encoding="utf-8")
    for needle in (
        "def is_cloudflare_api_transient_deploy_failure",
        "def cloudflare_deploy_api_retry_count",
        "def cloudflare_deploy_api_retry_delay_sec",
        "CF_DEPLOY_API_RETRIES",
    ):
        if needle not in lib_src:
            return fail(f"cloudflare_deploy_retry.py must include {needle!r}")

    gqc_src = GQC.read_text(encoding="utf-8")
    for needle in (
        "lib.cloudflare_deploy_retry",
        "is_cloudflare_api_transient_deploy_failure",
        'npm", "run", "cf:deploy"',
        "cloudflare_deploy_api_retry_delay_sec",
        "import time",
    ):
        if needle not in gqc_src:
            return fail(f"git-quick-commit must wire {needle!r}")

    if "is_cloudflare_api_transient_deploy_failure(output)" not in gqc_src:
        return fail("deploy_to_cloudflare must call transient detector on failed deploy")

    lib = load_module(LIB, "cloudflare_deploy_retry")
    detect = lib.is_cloudflare_api_transient_deploy_failure
    if not detect(SAMPLE_502):
        return fail("SAMPLE_502 must be detected as transient")
    if detect(SAMPLE_403):
        return fail("SAMPLE_403 (WAF) must NOT be treated as transient 5xx")
    if detect(SAMPLE_TS):
        return fail("TypeScript compile errors must NOT be treated as transient")
    if detect(""):
        return fail("empty output must not be transient")

    delay1 = lib.cloudflare_deploy_api_retry_delay_sec(1)
    delay2 = lib.cloudflare_deploy_api_retry_delay_sec(2)
    if delay1 < 10 or delay2 <= delay1:
        return fail("retry delay must back off (attempt2 > attempt1, >=10s)")

    # Local entry must re-export / call the same helpers
    gqc = load_module(GQC, "git_quick_commit")
    if not gqc.is_cloudflare_api_transient_deploy_failure(SAMPLE_502):
        return fail("git-quick-commit re-export must detect SAMPLE_502")

    print("[check_deploy_cloudflare_api_retry] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
