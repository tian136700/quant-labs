#!/usr/bin/env python3
"""Cloudflare Workers 部署 API 瞬时失败判定与退避（供 git-quick-commit 调用）。

versions 上传遇 502/503/504（常返回 HTML → Wrangler「malformed response」）时重试；
403 WAF / 业务编译错误不在此列。
"""

from __future__ import annotations

import os
import re
from pathlib import Path

_CF_VERSIONS_5XX_RE = re.compile(
    r"workers/scripts/\S+/versions\s*->\s*50[234]\b",
    re.IGNORECASE,
)
_CF_HTTP_5XX_RE = re.compile(r"(?:->\s*|HTTP\s+|status[=:\s]+)50[234]\b", re.IGNORECASE)
_CF_VERSIONS_4XX_RE = re.compile(
    r"workers/scripts/\S+/versions\s*->\s*4\d\d\b",
    re.IGNORECASE,
)


def is_cloudflare_api_transient_deploy_failure(output: str) -> bool:
    """Wrangler/OpenNext 上传 Worker 时 Cloudflare API 瞬时 502/503/504。"""
    text = output or ""
    if not text.strip():
        return False
    if _CF_VERSIONS_5XX_RE.search(text):
        return True
    malformed = "Received a malformed response from the API" in text
    wrangler_failed = "Wrangler deploy command failed" in text or (
        "ERROR" in text and "opennextjs-cloudflare deploy" in text
    )
    if not (malformed or wrangler_failed):
        return False
    if not _CF_HTTP_5XX_RE.search(text):
        return False
    if _CF_VERSIONS_4XX_RE.search(text):
        return False
    return True


def cloudflare_deploy_api_retry_count() -> int:
    raw = os.environ.get("CF_DEPLOY_API_RETRIES", "3").strip() or "3"
    try:
        n = int(raw)
    except ValueError:
        return 3
    return max(0, min(n, 5))


def cloudflare_deploy_api_retry_delay_sec(attempt: int) -> int:
    """attempt 从 1 起：20s / 40s / 60s … 上限 90s。"""
    return min(20 * max(1, attempt), 90)


def open_next_worker_ready(root: Path) -> bool:
    return (Path(root) / ".open-next" / "worker.js").is_file()
