#!/usr/bin/env python3
"""付费 Anthropic 中转客户端（与 STT phd_info 同一套 tokken.cc 接口）。

密钥只从本机环境 / ~/.config/info-quests/*.env / STT .env 读取，勿写入仓库。
来源参考：wq-code/stt/phd_info/translate_en.py、cold_letter.py
"""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_BASE = "https://tokken.cc"
DEFAULT_MODEL = "claude-sonnet-4-6"


def build_ssl_context() -> ssl.SSLContext | None:
    """与 en_vocab_fill_common 保持一致：优先显式 CA，再回退 certifi。"""
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


def build_online_source_label(model: str | None = None) -> str:
    """写回 D1 的来源角标：线上 Claude 补全一律存「Claude」。

    页面 JpVocabSourceLabel →「来源：Claude」。不写版本长名；Claude ≠ Cloud。
    model 参数保留给调用方兼容，不再拼进标签。
    """
    _ = model  # 兼容旧调用；展示层不再需要模型名
    return "Claude"


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
        with urllib.request.urlopen(req, timeout=timeout, context=_SSL) as resp:
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


def is_transient_anthropic_error(err: BaseException | str) -> bool:
    """鉴权/网关抖动：不应对单个 word_id 锁 6 小时 poison。

    词条本身没错；长 poison 会让队首词到下午才重试。
    """
    text = str(err or "")
    if not text:
        return False
    lower = text.lower()
    markers = (
        "http 401",
        "http 403",
        "invalid token",
        "unauthorized",
        "http 429",
        "http 502",
        "http 503",
        "http 504",
        "timed out",
        "timeout",
        "temporarily unavailable",
        "connection reset",
        "remote end closed",
        "network is unreachable",
        "name or service not known",
    )
    return any(m in lower for m in markers)


# 鉴权/网关类失败：短退避，避免 6h 卡死队首词
TRANSIENT_ANTHROPIC_POISON_SEC = 10 * 60


def poison_seconds_for_generate_error(
    reason: str, *, default_sec: int
) -> int:
    """generate 失败用多久跳过该词：瞬时错误短退避，内容/校验失败用 default。"""
    if is_transient_anthropic_error(reason):
        return max(60, int(TRANSIENT_ANTHROPIC_POISON_SEC))
    try:
        return max(60, int(default_sec))
    except (TypeError, ValueError):
        return max(60, int(TRANSIENT_ANTHROPIC_POISON_SEC))
