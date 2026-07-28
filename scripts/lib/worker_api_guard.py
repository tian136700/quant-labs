#!/usr/bin/env python3
"""Worker 可用性门禁：站点 1027 / 不可达时，跳过后续付费调用。"""

from __future__ import annotations

import urllib.error
import urllib.parse
import urllib.request

_RATE_LIMIT_HINTS = (
    "error 1027",
    "temporarily rate limited",
    "plan limits",
    "check back later",
)


def _origin_from_api_url(api_url: str) -> str:
    parsed = urllib.parse.urlparse(api_url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"invalid api url: {api_url}")
    return f"{parsed.scheme}://{parsed.netloc}"


def worker_origin_available(api_url: str, *, timeout: int = 12) -> tuple[bool, str]:
    """返回 (可用, 原因)。可用=False 时应跳过本轮请求。"""
    origin = _origin_from_api_url(api_url)
    probe_url = f"{origin}/"
    req = urllib.request.Request(
        probe_url,
        method="GET",
        headers={
            "User-Agent": "worker-api-guard/1.0",
            "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = int(getattr(resp, "status", 200) or 200)
            body = resp.read(1200).decode("utf-8", errors="replace").lower()
            if status >= 500:
                return False, f"http_{status}"
            if any(hint in body for hint in _RATE_LIMIT_HINTS):
                return False, "rate_limited_1027"
            return True, "ok"
    except urllib.error.HTTPError as exc:
        body = exc.read(1200).decode("utf-8", errors="replace").lower()
        if exc.code == 429:
            return False, "http_429"
        if any(hint in body for hint in _RATE_LIMIT_HINTS):
            return False, "rate_limited_1027"
        # 401/403 常见于受保护首页，也视为站点可达
        if exc.code in (401, 403):
            return True, f"http_{exc.code}"
        return False, f"http_{exc.code}"
    except urllib.error.URLError as exc:
        return False, f"url_error:{exc.reason}"
    except Exception as exc:  # noqa: BLE001
        return False, f"probe_error:{exc}"

