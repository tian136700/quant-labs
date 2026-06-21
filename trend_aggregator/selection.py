"""
从清洗后的趋势数据中选取 Top N 条（默认 10），优先 GitHub Stars 与 Reddit 热帖。

策略（可在 run 时调整）：
- GitHub：按 stars 降序取 7 条（开源项目热度最直观）
- Reddit：按 subreddit 优先级 + RSS 顺序取 3 条（PromptEngineering / LocalLLaMA 优先）
- 若 Reddit 不足，用 GitHub 补齐至 10 条
"""

from __future__ import annotations

from typing import Any

GITHUB_SLOTS = 7
REDDIT_SLOTS = 3
TOTAL_SELECTED = 10

# 数值越大越优先（Prompt 类社区更适合做 AI 提示词素材）
SUBREDDIT_PRIORITY: dict[str, int] = {
    "PromptEngineering": 4,
    "LocalLLaMA": 3,
    "OpenAI": 2,
    "ChatGPT": 1,
}


def _github_heat(item: dict[str, Any]) -> float:
    try:
        return float(item.get("stars") or 0)
    except (TypeError, ValueError):
        return 0.0


def _reddit_heat(item: dict[str, Any], feed_index: int) -> float:
    sub = str(item.get("subreddit") or "")
    sub_pri = SUBREDDIT_PRIORITY.get(sub, 0)
    # RSS Top/day 顺序：越靠前越热；subreddit 优先级加权
    return sub_pri * 1_000_000.0 - float(feed_index)


def select_top_items(
    processed: dict[str, Any],
    *,
    total: int = TOTAL_SELECTED,
    github_slots: int = GITHUB_SLOTS,
    reddit_slots: int = REDDIT_SLOTS,
) -> list[dict[str, Any]]:
    """
    从 processed（含 github / reddit 键）中选出 Top N 条目。

    Returns:
        每条附带 ``_heat_score``、``_selection_rank`` 的 dict 列表（rank 从 1 起）。
    """
    github = list(processed.get("github") or [])
    reddit = list(processed.get("reddit") or [])

    github_sorted = sorted(github, key=_github_heat, reverse=True)
    github_picked = github_sorted[:github_slots]

    reddit_scored: list[tuple[float, int, dict[str, Any]]] = []
    for idx, item in enumerate(reddit):
        reddit_scored.append((_reddit_heat(item, idx), idx, item))
    reddit_scored.sort(key=lambda t: (-t[0], t[1]))
    reddit_picked = [t[2] for t in reddit_scored[:reddit_slots]]

    selected: list[dict[str, Any]] = list(github_picked) + list(reddit_picked)

    if len(selected) < total and len(github_sorted) > len(github_picked):
        need = total - len(selected)
        selected.extend(github_sorted[len(github_picked) : len(github_picked) + need])

    selected = selected[:total]

    result: list[dict[str, Any]] = []
    for rank, item in enumerate(selected, start=1):
        enriched = dict(item)
        source = str(item.get("source") or "")
        if source == "github":
            heat = _github_heat(item)
        elif source == "reddit":
            feed_idx = next(
                (i for i, r in enumerate(reddit) if r.get("id") == item.get("id")),
                rank,
            )
            heat = _reddit_heat(item, feed_idx)
        else:
            heat = float(rank)
        enriched["_heat_score"] = heat
        enriched["_selection_rank"] = rank
        result.append(enriched)

    return result
