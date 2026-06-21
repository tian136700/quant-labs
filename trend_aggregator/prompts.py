"""
构建 **一条** 可复制粘贴到 DeepSeek 的完整 AI 提示词。

结构（与用户范本一致）：
1. 顶部：Top-N 条目的完整 JSON（``fetched_at`` + ``processed.github`` / ``reddit``）
2. 空行
3. 下方：博客生成说明（来自 prompt.txt，已去掉「去读文件/API」类表述）

不拆 System / User 两个框；DeepSeek 侧整段粘贴即可。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

MODULE_DIR = Path(__file__).resolve().parent
PROMPT_FILE = MODULE_DIR / "prompt.txt"

_INTERNAL_KEYS = frozenset({
    "_heat_score",
    "_selection_rank",
    "system_prompt",
    "user_prompt",
    "full_prompt",
})


def load_system_prompt() -> str:
    """读取 prompt.txt 中的博客生成说明。"""
    if not PROMPT_FILE.is_file():
        return (
            "You are a senior AI technology blogger. "
            "Transform the GitHub trending JSON data below into SEO English Markdown."
        )
    return PROMPT_FILE.read_text(encoding="utf-8").strip()


def _sanitize_instructions(text: str) -> str:
    """去掉「去读本地文件 / 调 API」等表述，避免模型误以为还要拉取数据。"""
    cleaned = text
    replacements = [
        (
            "输入：raw_trends.json 中的 GitHub 趋势数据（JSON 或 parse_github_json 文本）",
            "输入：见本文最上方 INPUT DATA 中的 JSON（已嵌入，勿再读取外部文件）",
        ),
        (
            "用途：作为 DeepSeek / OpenAI 兼容 API 的 system message",
            "用途：复制整段到 DeepSeek / OpenAI API 即可",
        ),
        ("注入 web/index.html 的 #content-area", "输出 Markdown 博客正文"),
        ("see `output/raw_trends.json`", "见本文最上方 INPUT DATA"),
        ("`output/raw_trends.json`", "本文 INPUT DATA"),
        (
            "from our aggregator pipeline",
            "in the INPUT DATA section at the top of this message",
        ),
        (
            "The input JSON follows this schema (见本文最上方 INPUT DATA):",
            "The real input JSON is at the top of this message (INPUT DATA). "
            "The schema example below is for reference only — use INPUT DATA as source of truth:",
        ),
        (
            "The user will send parsed GitHub trend data (JSON or pre-formatted text). "
            "Treat it as the single source of truth and produce the blog post immediately.",
            "The INPUT DATA JSON is already included at the top of this message. "
            "Use it as the single source of truth and produce the blog post immediately.",
        ),
    ]
    for old, new in replacements:
        cleaned = cleaned.replace(old, new)
    return cleaned.strip()


def clean_item_for_prompt(item: dict[str, Any]) -> dict[str, Any]:
    """去掉入库/选榜内部字段，保留与抓取 JSON 一致的结构。"""
    return {
        k: v
        for k, v in item.items()
        if k not in _INTERNAL_KEYS and not str(k).startswith("_")
    }


def build_trend_json_payload(
    items: list[dict[str, Any]],
    *,
    fetched_at: str | None = None,
) -> dict[str, Any]:
    """组装嵌入提示词顶部的 JSON 数据块。"""
    github: list[dict[str, Any]] = []
    reddit: list[dict[str, Any]] = []

    for item in items:
        cleaned = clean_item_for_prompt(item)
        source = str(cleaned.get("source") or "github")
        if source == "reddit":
            reddit.append(cleaned)
        else:
            github.append(cleaned)

    processed: dict[str, Any] = {}
    if github:
        processed["github"] = github
    if reddit:
        processed["reddit"] = reddit

    payload: dict[str, Any] = {"processed": processed}
    if fetched_at:
        payload["fetched_at"] = fetched_at
    return payload


def build_input_data_json(
    items: list[dict[str, Any]],
    *,
    fetched_at: str | None = None,
) -> str:
    """Top-N 条目 → pretty JSON 字符串。"""
    payload = build_trend_json_payload(items, fetched_at=fetched_at)
    return json.dumps(payload, ensure_ascii=False, indent=2)


def build_full_prompt(
    items: list[dict[str, Any]],
    *,
    fetched_at: str | None = None,
) -> str:
    """
    一条完整 AI 提示词：INPUT DATA（JSON）+ 博客生成说明。

    复制整段粘贴到 DeepSeek 即可，无需再传文件或调接口。
    """
    data_json = build_input_data_json(items, fetched_at=fetched_at)
    instructions = _sanitize_instructions(load_system_prompt())
    return (
        "=== INPUT DATA (GitHub / Reddit trends — use as single source of truth) ===\n\n"
        f"{data_json}\n\n"
        "=== INSTRUCTIONS ===\n\n"
        f"{instructions}"
    )


def attach_prompts_to_items(
    items: list[dict[str, Any]],
    *,
    fetched_at: str | None = None,
) -> list[dict[str, Any]]:
    """为每条选中条目附加 ``full_prompt``（单条试跑版）。"""
    result: list[dict[str, Any]] = []
    for item in items:
        enriched = dict(item)
        enriched["full_prompt"] = build_full_prompt([item], fetched_at=fetched_at)
        result.append(enriched)
    return result


# 兼容旧调用名
def build_batch_user_prompt(
    items: list[dict[str, Any]],
    *,
    fetched_at: str | None = None,
) -> str:
    return build_full_prompt(items, fetched_at=fetched_at)


def build_user_prompt_for_item(
    item: dict[str, Any],
    *,
    fetched_at: str | None = None,
) -> str:
    return build_full_prompt([item], fetched_at=fetched_at)
