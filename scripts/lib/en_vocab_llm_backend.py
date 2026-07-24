#!/usr/bin/env python3
"""英语词条补全：本地 Ollama vs 线上付费 Anthropic（tokken）一键切换。

改下面这一行即可（也可用环境变量 EN_VOCAB_FILL_LLM_BACKEND 覆盖）：

  0 = 本地 Ollama（分阶段队列：音标→释义→词性→用法→例句）
  1 = 线上付费 API（tokken.cc Anthropic 中转；一词一次补齐音标/释义/词性/用法/例句）
"""

from __future__ import annotations

import os
from pathlib import Path

# ========== 一键切换（改这里）==========
# 0 = 本地 Ollama（分阶段队列）
# 1 = 线上付费 Anthropic 中转（tokken.cc，与 STT 博士套磁信同一接口）
EN_VOCAB_FILL_LLM_BACKEND = 1
# =====================================

BACKEND_LOCAL = 0
BACKEND_ONLINE = 1


def _load_env_backend() -> str | None:
    for name in ("en-vocab-fill.env", "jp-review-sync.env"):
        path = Path.home() / ".config" / "info-quests" / name
        if not path.is_file():
            continue
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                if key.strip() == "EN_VOCAB_FILL_LLM_BACKEND":
                    return value.strip().strip('"').strip("'")
        except OSError:
            continue
    return None


def resolve_en_vocab_llm_backend() -> int:
    """返回 0（本地）或 1（线上）。env 优先于本文件常量。"""
    raw = (
        os.environ.get("EN_VOCAB_FILL_LLM_BACKEND", "").strip()
        or (_load_env_backend() or "")
        or str(EN_VOCAB_FILL_LLM_BACKEND)
    ).strip()
    if raw in ("1", "online", "paid", "anthropic", "tokken", "cloud"):
        return BACKEND_ONLINE
    return BACKEND_LOCAL


def is_online_backend() -> bool:
    return resolve_en_vocab_llm_backend() == BACKEND_ONLINE


def backend_label() -> str:
    return (
        "online(tokken/Anthropic)"
        if is_online_backend()
        else "local(Ollama)"
    )
