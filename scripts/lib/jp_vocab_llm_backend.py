#!/usr/bin/env python3
"""日语词条补全：本地 Ollama 分阶段 vs 线上付费 Anthropic（tokken）一键切换。

改下面这一行即可（也可用环境变量 JP_VOCAB_FILL_LLM_BACKEND 覆盖）：

  0 = 本地 Ollama（词性 / 例句分阶段；读音 Jisho；语法另有独立脚本）
  1 = 线上付费 API（一词一次补齐；单词+语法智能分支）
"""

from __future__ import annotations

import os
from pathlib import Path

# ========== 一键切换（改这里）==========
JP_VOCAB_FILL_LLM_BACKEND = 1
# =====================================

BACKEND_LOCAL = 0
BACKEND_ONLINE = 1


def _load_env_backend() -> str | None:
    for name in ("jp-vocab-fill.env", "en-vocab-fill.env", "jp-review-sync.env"):
        path = Path.home() / ".config" / "info-quests" / name
        if not path.is_file():
            continue
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                if key.strip() == "JP_VOCAB_FILL_LLM_BACKEND":
                    return value.strip().strip('"').strip("'")
        except OSError:
            continue
    return None


def resolve_jp_vocab_llm_backend() -> int:
    raw = (
        os.environ.get("JP_VOCAB_FILL_LLM_BACKEND", "").strip()
        or (_load_env_backend() or "")
        or str(JP_VOCAB_FILL_LLM_BACKEND)
    ).strip()
    if raw in ("1", "online", "paid", "anthropic", "tokken", "cloud"):
        return BACKEND_ONLINE
    return BACKEND_LOCAL


def is_online_backend() -> bool:
    return resolve_jp_vocab_llm_backend() == BACKEND_ONLINE


def backend_label() -> str:
    return (
        "online(tokken/Anthropic)"
        if is_online_backend()
        else "local(Ollama/Jisho)"
    )
