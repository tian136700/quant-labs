"""词表补全打线上 Worker：统一 ≥5s 间隔 + 区分接口限流 429 / 配额 1027。

凡 Mac 定时 / 脚本 POST /api/{jp,en}-vocab/fill-* 须走本模块，
避免脚本失控每秒狂打（429 也会烧日配额）。
"""

from __future__ import annotations

import json
import ssl
import time
import urllib.error
import urllib.request
from typing import Any

# 与线上 VOCAB_FILL_API_MIN_INTERVAL_MS=5000 对齐
API_MIN_INTERVAL_SEC = 5

_last_worker_api_at = 0.0


def _is_fill_interval_rate_limited(detail: str) -> bool:
    text = (detail or "").lower()
    return "rate_limited" in text and "1027" not in text


def _ssl_context() -> ssl.SSLContext | None:
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def post_worker_fill_api(
    api_url: str,
    token: str,
    payload: dict[str, Any],
    *,
    user_agent: str = "vocab-fill/1.0",
    timeout: int = 180,
    retries: int = 6,
    ssl_context: ssl.SSLContext | None = None,
) -> dict[str, Any]:
    """POST fill API；本地先等满 5s；接口限流尊 Retry-After；配额 1027 整轮 exit 0。"""
    global _last_worker_api_at

    gap = API_MIN_INTERVAL_SEC - (time.time() - _last_worker_api_at)
    if _last_worker_api_at > 0 and gap > 0:
        print(
            f"[{user_agent}] Worker 间隔门禁：等待 {gap:.1f}s"
            f"（≥{API_MIN_INTERVAL_SEC}s）…",
            flush=True,
        )
        time.sleep(gap)

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    ctx = ssl_context if ssl_context is not None else _ssl_context()
    last_err: Exception | None = None

    for attempt in range(1, max(1, retries) + 1):
        req = urllib.request.Request(
            api_url,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": user_agent,
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                out = json.loads(resp.read().decode("utf-8"))
                _last_worker_api_at = time.time()
                return out
        except urllib.error.HTTPError as err:
            detail = err.read().decode("utf-8", errors="replace")
            if err.code == 429 and _is_fill_interval_rate_limited(detail):
                retry_hdr = err.headers.get("Retry-After") if err.headers else None
                try:
                    wait = max(
                        API_MIN_INTERVAL_SEC, int(float(retry_hdr or str(API_MIN_INTERVAL_SEC)))
                    )
                except ValueError:
                    wait = API_MIN_INTERVAL_SEC
                print(
                    f"[{user_agent}] 接口限流 429 "
                    f"(attempt {attempt}/{retries})，等待 {wait}s… "
                    f"detail={detail[:120]!r}",
                    flush=True,
                )
                time.sleep(wait)
                _last_worker_api_at = time.time()
                last_err = SystemExit(f"API HTTP 429: {detail}")
                if attempt >= retries:
                    raise last_err from err
                continue

            try:
                from worker_api_guard import (  # noqa: WPS433
                    looks_rate_limited_body,
                    record_worker_unavailable,
                )

                if err.code == 429 or looks_rate_limited_body(detail):
                    reason = (
                        "rate_limited_1027"
                        if looks_rate_limited_body(detail)
                        else "http_429"
                    )
                    record_worker_unavailable(api_url, reason)
                    print(
                        f"[{user_agent}] skip: Worker {reason}；本轮退出，"
                        "约 10 分钟后再试（配额约北京 08:00 重置）。",
                        flush=True,
                    )
                    raise SystemExit(0) from err
            except SystemExit:
                raise
            except Exception:
                pass

            if err.code in {500, 502, 503, 504} and attempt < retries:
                wait = min(60, 2 ** attempt)
                print(
                    f"[{user_agent}] Worker HTTP {err.code} "
                    f"(attempt {attempt}/{retries})，{wait}s 后重试…",
                    flush=True,
                )
                time.sleep(wait)
                last_err = SystemExit(f"API HTTP {err.code}: {detail}")
                continue

            raise SystemExit(f"API HTTP {err.code}: {detail}") from err
        except urllib.error.URLError as exc:
            last_err = SystemExit(f"URL error: {exc}")
            if attempt >= retries:
                raise last_err from exc
            wait = min(60, 2 ** attempt)
            print(
                f"[{user_agent}] 网络错误 (attempt {attempt}/{retries})，"
                f"{wait}s 后重试… {exc}",
                flush=True,
            )
            time.sleep(wait)

    raise last_err or SystemExit("post_worker_fill_api failed")
