#!/usr/bin/env python3
"""英语词条补全共用：鉴权、API、本机 Ollama（见 ~/.config/local-llm/howto.md）。"""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_BASE = "https://finance.info-quests.com"
OLLAMA_CHAT_URL = os.environ.get(
    "EN_VOCAB_FILL_OLLAMA_URL", "http://127.0.0.1:11434/api/chat"
).strip()
OLLAMA_TAGS_URL = os.environ.get(
    "EN_VOCAB_FILL_OLLAMA_TAGS_URL", "http://127.0.0.1:11434/api/tags"
).strip()
# 用户偏好谷歌模型；howto 里 quality_model = gemma4:26b
DEFAULT_OLLAMA_MODEL = "gemma4:26b"
DEFAULT_FALLBACK_MODELS = "qwen2.5:14b,qwen2.5:7b"
DEFAULT_SOURCE = "本地 gemma4:26b"
# 单模型读超时（秒）；超时立刻切下一档，不把 10 分钟再重试一遍
DEFAULT_OLLAMA_TIMEOUT_SEC = 600
# 与线上 Worker 词表补全硬限流对齐（每 IP × 路径 ≥5s）
API_MIN_INTERVAL_SEC = 5

_last_worker_api_at = 0.0


def load_env_file(name: str) -> dict[str, str]:
    cfg_path = Path.home() / ".config" / "info-quests" / name
    data: dict[str, str] = {}
    if not cfg_path.is_file():
        return data
    for line in cfg_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def resolve_token() -> str:
    return (
        os.environ.get("JP_REVIEW_UPLOAD_TOKEN", "").strip()
        or load_env_file("jp-review-sync.env").get("JP_REVIEW_UPLOAD_TOKEN", "")
    ).strip()


def resolve_ollama_model() -> str:
    return (
        os.environ.get("EN_VOCAB_FILL_OLLAMA_MODEL", "").strip()
        or load_env_file("en-vocab-fill.env").get("EN_VOCAB_FILL_OLLAMA_MODEL", "")
        or DEFAULT_OLLAMA_MODEL
    ).strip() or DEFAULT_OLLAMA_MODEL


def resolve_ollama_timeout_sec() -> int:
    raw = (
        os.environ.get("EN_VOCAB_FILL_OLLAMA_TIMEOUT_SEC", "").strip()
        or load_env_file("en-vocab-fill.env").get("EN_VOCAB_FILL_OLLAMA_TIMEOUT_SEC", "")
        or str(DEFAULT_OLLAMA_TIMEOUT_SEC)
    )
    try:
        return max(30, int(raw))
    except ValueError:
        return DEFAULT_OLLAMA_TIMEOUT_SEC


def resolve_ollama_fallback_models(primary: str = "") -> list[str]:
    """主模型之后的兜底链：阿里 14b → 7b（可被 env 覆盖）。"""
    primary = (primary or resolve_ollama_model()).strip()
    raw = (
        os.environ.get("EN_VOCAB_FILL_OLLAMA_FALLBACK_MODEL", "").strip()
        or os.environ.get("EN_VOCAB_FILL_OLLAMA_FALLBACK_MODELS", "").strip()
        or load_env_file("en-vocab-fill.env").get("EN_VOCAB_FILL_OLLAMA_FALLBACK_MODEL", "")
        or DEFAULT_FALLBACK_MODELS
    )
    out: list[str] = []
    seen = {primary}
    for part in raw.split(","):
        m = part.strip()
        if not m or m in seen:
            continue
        seen.add(m)
        out.append(m)
    return out


def resolve_ollama_model_chain(primary: str | None = None) -> list[str]:
    primary = (primary or resolve_ollama_model()).strip() or DEFAULT_OLLAMA_MODEL
    return [primary] + resolve_ollama_fallback_models(primary)


def build_source_label(model: str | None = None) -> str:
    m = (model or resolve_ollama_model()).strip() or DEFAULT_OLLAMA_MODEL
    return f"本地 {m}"


def is_ollama_timeout_error(exc: BaseException) -> bool:
    text = str(exc).lower()
    return (
        "timeout" in text
        or "timed out" in text
        or "wall-clock" in text
        or isinstance(exc, TimeoutError)
    )


def build_ssl_context() -> ssl.SSLContext | None:
    cafile = os.environ.get("SSL_CERT_FILE", "").strip()
    capath = os.environ.get("SSL_CERT_DIR", "").strip()
    if cafile or capath:
        return ssl.create_default_context(cafile=cafile or None, capath=capath or None)
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return None


_SSL = build_ssl_context()


def _is_fill_interval_rate_limited(detail: str) -> bool:
    text = (detail or "").lower()
    return "rate_limited" in text and "1027" not in text


def call_api(
    api_url: str,
    token: str,
    payload: dict,
    *,
    timeout: int = 180,
    user_agent: str = "en-vocab-fill/1.0",
    retries: int = 6,
) -> dict:
    """POST Worker；本地对齐 ≥5s；接口限流 429 尊 Retry-After；配额 1027 才整轮退出。"""
    import time

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
    last_err: Exception | None = None

    for attempt in range(1, max(1, retries) + 1):
        req = urllib.request.Request(
            api_url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
                "User-Agent": user_agent,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=_SSL) as resp:
                payload_out = json.loads(resp.read().decode("utf-8"))
                _last_worker_api_at = time.time()
                return payload_out
        except urllib.error.HTTPError as err:
            detail = err.read().decode("utf-8", errors="replace")
            if err.code == 429 and _is_fill_interval_rate_limited(detail):
                retry_hdr = err.headers.get("Retry-After") if err.headers else None
                try:
                    wait = max(API_MIN_INTERVAL_SEC, int(float(retry_hdr or "5")))
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
            raise SystemExit(f"API HTTP {err.code}: {detail}") from err

    raise last_err or SystemExit("call_api failed")


def probe_ollama(*, timeout: int = 5) -> bool:
    try:
        req = urllib.request.Request(OLLAMA_TAGS_URL, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        models = payload.get("models") or []
        return isinstance(models, list) and len(models) > 0
    except Exception:
        return False


def call_ollama(
    prompt: str,
    *,
    model: str | None = None,
    timeout: int | None = None,
) -> str:
    """调本机 Ollama。

    注意：urllib/socket 的 timeout 只看「多久没收到字节」。模型慢慢吐字时
    可能拖十几分钟还不触发。这里再用线程做 **墙钟硬超时**，到点就抛错切兜底。
    """
    import threading

    model = (model or resolve_ollama_model()).strip()
    timeout = int(
        timeout if timeout is not None else resolve_ollama_timeout_sec()
    )

    def _once() -> str:
        body = json.dumps(
            {
                "model": model,
                "stream": False,
                "messages": [{"role": "user", "content": prompt}],
            },
            ensure_ascii=False,
        ).encode("utf-8")
        req = urllib.request.Request(
            OLLAMA_CHAT_URL,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        # socket 超时略大于墙钟，真正截止靠下面的 join
        with urllib.request.urlopen(req, timeout=max(30, timeout + 30)) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        msg = payload.get("message") or {}
        content = str(msg.get("content") or payload.get("response") or "").strip()
        if not content:
            raise RuntimeError(f"Ollama 空响应 model={model}")
        return content

    box: dict[str, object] = {}

    def worker() -> None:
        try:
            box["value"] = _once()
        except Exception as exc:  # noqa: BLE001 — 回传给主线程
            box["error"] = exc

    thread = threading.Thread(target=worker, name=f"ollama-{model}", daemon=True)
    thread.start()
    thread.join(timeout=float(timeout))
    if thread.is_alive():
        raise TimeoutError(
            f"Ollama wall-clock timeout {timeout}s model={model} "
            f"(卡住超过时限，应切下一兜底模型)"
        )
    if "error" in box:
        raise box["error"]  # type: ignore[misc]
    return str(box.get("value") or "")
