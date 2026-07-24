#!/usr/bin/env python3
"""付费 Anthropic 中转客户端（与 STT phd_info 同一套 tokken.cc 接口）。

密钥只从本机环境 / ~/.config/info-quests/*.env / STT .env 读取，勿写入仓库。
来源参考：wq-code/stt/phd_info/translate_en.py、cold_letter.py
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_BASE = "https://tokken.cc"
DEFAULT_MODEL = "claude-sonnet-4-6"


def _read_dotenv(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            out[key.strip()] = value.strip().strip('"').strip("'")
    except OSError:
        return out
    return out


def _merged_secrets() -> dict[str, str]:
    data: dict[str, str] = {}
    # 低优先级 → 高优先级
    candidates = [
        Path("/Users/Admin/Documents/code/wq-code/stt/.env"),
        Path.home() / ".config" / "info-quests" / "jp-review-sync.env",
        Path.home() / ".config" / "info-quests" / "en-vocab-fill.env",
        Path.home() / ".config" / "info-quests" / "anthropic.env",
    ]
    for path in candidates:
        data.update(_read_dotenv(path))
    # 进程环境最后覆盖
    for key in (
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_BASE_URL",
        "ANTHROPIC_MODEL",
    ):
        val = os.environ.get(key, "").strip()
        if val:
            data[key] = val
    return data


def anthropic_token() -> str:
    cfg = _merged_secrets()
    return (
        cfg.get("ANTHROPIC_AUTH_TOKEN")
        or cfg.get("ANTHROPIC_API_KEY")
        or ""
    ).strip()


def anthropic_base() -> str:
    cfg = _merged_secrets()
    base = (cfg.get("ANTHROPIC_BASE_URL") or DEFAULT_BASE).strip().rstrip("/")
    if base.endswith("tokken.top"):
        base = DEFAULT_BASE
    return base or DEFAULT_BASE


def anthropic_model() -> str:
    cfg = _merged_secrets()
    return (
        cfg.get("ANTHROPIC_MODEL") or DEFAULT_MODEL
    ).strip() or DEFAULT_MODEL


def extract_anthropic_text(data: dict[str, Any]) -> str:
    parts: list[str] = []
    for block in data.get("content") or []:
        if isinstance(block, dict) and block.get("type") == "text":
            parts.append(str(block.get("text") or ""))
    return "\n".join(p for p in parts if p).strip()


def call_anthropic(
    prompt: str,
    *,
    system: str = "",
    max_tokens: int = 4500,
    temperature: float = 0.3,
    timeout: int = 180,
    model: str | None = None,
) -> str:
    """POST {base}/v1/messages；返回助手纯文本。"""
    token = anthropic_token()
    if not token:
        raise RuntimeError(
            "未配置 ANTHROPIC_AUTH_TOKEN（可写 ~/.config/info-quests/en-vocab-fill.env "
            "或复用 STT .env）"
        )
    use_model = (model or anthropic_model()).strip() or DEFAULT_MODEL
    url = f"{anthropic_base()}/v1/messages"
    headers = {
        "x-api-key": token,
        "Authorization": f"Bearer {token}",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body: dict[str, Any] = {
        "model": use_model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system.strip():
        body["system"] = system.strip()

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"Anthropic 中转 HTTP {err.code}: {detail}") from err
    except Exception as err:
        raise RuntimeError(f"Anthropic 中转请求失败: {err}") from err

    data = json.loads(raw)
    out = extract_anthropic_text(data)
    if not out:
        raise RuntimeError(f"Anthropic 返回空内容: {str(data)[:300]}")
    return out


def probe_anthropic(*, timeout: int = 15) -> bool:
    """轻量探测：有密钥且能打通即可（不烧大 prompt）。"""
    if not anthropic_token():
        return False
    try:
        call_anthropic(
            "Reply with exactly: ok",
            max_tokens=16,
            temperature=0,
            timeout=timeout,
        )
        return True
    except Exception:
        return False
