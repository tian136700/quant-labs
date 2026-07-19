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
DEFAULT_SOURCE = "本地 gemma4:26b"


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


def build_source_label(model: str | None = None) -> str:
    m = (model or resolve_ollama_model()).strip() or DEFAULT_OLLAMA_MODEL
    return f"本地 {m}"


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


def call_api(
    api_url: str,
    token: str,
    payload: dict,
    *,
    timeout: int = 180,
    user_agent: str = "en-vocab-fill/1.0",
) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
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
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"API HTTP {err.code}: {detail}") from err


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
    model = (model or resolve_ollama_model()).strip()
    timeout = int(
        timeout
        if timeout is not None
        else os.environ.get("EN_VOCAB_FILL_OLLAMA_TIMEOUT_SEC", "360")
    )
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
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    msg = payload.get("message") or {}
    content = str(msg.get("content") or payload.get("response") or "").strip()
    if not content:
        raise RuntimeError(f"Ollama 空响应 model={model}")
    return content
