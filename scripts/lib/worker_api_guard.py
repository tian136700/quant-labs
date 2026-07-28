#!/usr/bin/env python3
"""Worker 可用性门禁：站点 1027 / 不可达时，跳过后续付费调用。

约定（与 launchd 10 分钟对齐）：
  - 探测到 Error 1027 / 429 / 5xx → 本轮跳过，不打付费、不写库
  - 把「不可用」结果缓存约 10 分钟，避免语法每分钟任务反复探首页烧配额
  - 缓存过期后再探；直到站点恢复才继续补全
  - Cloudflare 免费档日配额约 UTC 0 点重置 ≈ 北京时间 08:00
"""

from __future__ import annotations

import json
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

_RATE_LIMIT_HINTS = (
    "error 1027",
    "error code 1027",
    "code 1027",
    "temporarily rate limited",
    "plan limits",
    "check back later",
    "workers_exceeded",
    "worker exceeded",
)

# 与多数 fill launchd StartInterval=600 对齐；语法虽每分钟跑，命中后也只 10 分钟再探一次
_NEGATIVE_CACHE_SEC = 600
_CACHE_PATH = (
    Path.home() / ".config" / "info-quests" / "worker-api-guard.cache.json"
)


def _origin_from_api_url(api_url: str) -> str:
    parsed = urllib.parse.urlparse(api_url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"invalid api url: {api_url}")
    return f"{parsed.scheme}://{parsed.netloc}"


def _ssl_context() -> ssl.SSLContext:
    """优先用 certifi；否则走系统默认，避免 macOS Python 缺 CA 误判不可用。"""
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _read_negative_cache(origin: str) -> tuple[bool, str] | None:
    try:
        if not _CACHE_PATH.is_file():
            return None
        raw = json.loads(_CACHE_PATH.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return None
        if str(raw.get("origin") or "") != origin:
            return None
        reason = str(raw.get("reason") or "cached_unavailable")
        until = float(raw.get("until") or 0)
        if time.time() < until:
            return False, f"{reason}(cached)"
    except Exception:
        return None
    return None


def _write_negative_cache(origin: str, reason: str) -> None:
    try:
        _CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "origin": origin,
            "reason": reason,
            "until": time.time() + _NEGATIVE_CACHE_SEC,
            "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        _CACHE_PATH.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except Exception:
        pass


def _clear_negative_cache(origin: str) -> None:
    try:
        if not _CACHE_PATH.is_file():
            return
        raw = json.loads(_CACHE_PATH.read_text(encoding="utf-8"))
        if isinstance(raw, dict) and str(raw.get("origin") or "") == origin:
            _CACHE_PATH.unlink(missing_ok=True)
    except Exception:
        pass


def looks_rate_limited_body(body: str) -> bool:
    text = (body or "").lower()
    return any(hint in text for hint in _RATE_LIMIT_HINTS)


def record_worker_unavailable(api_url: str, reason: str = "rate_limited_1027") -> None:
    """业务请求已撞上 1027/429 时写入负缓存，供其它定时任务共亨跳过。"""
    try:
        origin = _origin_from_api_url(api_url)
    except ValueError:
        return
    _write_negative_cache(origin, reason)


def worker_origin_available(api_url: str, *, timeout: int = 12) -> tuple[bool, str]:
    """返回 (可用, 原因)。可用=False 时应跳过本轮请求。"""
    origin = _origin_from_api_url(api_url)

    cached = _read_negative_cache(origin)
    if cached is not None:
        return cached

    probe_url = f"{origin}/"
    req = urllib.request.Request(
        probe_url,
        method="GET",
        headers={
            "User-Agent": "worker-api-guard/1.1",
            "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
        },
    )
    ctx = _ssl_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            status = int(getattr(resp, "status", 200) or 200)
            body = resp.read(2400).decode("utf-8", errors="replace")
            if status >= 500:
                reason = f"http_{status}"
                _write_negative_cache(origin, reason)
                return False, reason
            if looks_rate_limited_body(body):
                reason = "rate_limited_1027"
                _write_negative_cache(origin, reason)
                return False, reason
            _clear_negative_cache(origin)
            return True, "ok"
    except urllib.error.HTTPError as exc:
        body = exc.read(2400).decode("utf-8", errors="replace")
        if exc.code == 429 or looks_rate_limited_body(body):
            reason = (
                "rate_limited_1027"
                if looks_rate_limited_body(body)
                else "http_429"
            )
            _write_negative_cache(origin, reason)
            return False, reason
        # 401/403 常见于受保护首页，也视为站点可达
        if exc.code in (401, 403):
            _clear_negative_cache(origin)
            return True, f"http_{exc.code}"
        if exc.code >= 500:
            reason = f"http_{exc.code}"
            _write_negative_cache(origin, reason)
            return False, reason
        # 其它 4xx：站点还能响应，不挡补全
        _clear_negative_cache(origin)
        return True, f"http_{exc.code}"
    except urllib.error.URLError as exc:
        reason = f"url_error:{exc.reason}"
        # SSL 偶发失败不要锁 10 分钟；只跳过本轮
        if "CERTIFICATE" in str(exc.reason).upper() or "SSL" in str(exc.reason).upper():
            return False, reason
        _write_negative_cache(origin, reason)
        return False, reason
    except Exception as exc:  # noqa: BLE001
        return False, f"probe_error:{exc}"


def skip_if_worker_unavailable(api_url: str, *, label: str) -> bool:
    """不可用则打印 skip 并返回 True（调用方应 return 0）。"""
    available, reason = worker_origin_available(api_url)
    if available:
        return False
    print(
        f"[{label}] skip: Worker origin unavailable ({reason}); "
        "不会调用付费/写库接口。约 10 分钟后再探（配额约北京 08:00 重置）。",
        flush=True,
    )
    return True
