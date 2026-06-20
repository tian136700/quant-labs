"""
trend_aggregator 数据抓取模块。

通过 GitHub 官方 Search API 与 Reddit 标准 RSS 订阅获取原始趋势数据。
每个抓取函数独立容错，失败时返回空列表并记录错误，不中断调用方。
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any
import feedparser
import requests

from config import (
    GITHUB_AI_KEYWORDS,
    GITHUB_API_BASE,
    GITHUB_MAX_OR_OPERATORS_PER_QUERY,
    GITHUB_MIN_STARS,
    GITHUB_PUSHED_WITHIN_DAYS,
    GITHUB_SEARCH_PER_PAGE,
    GITHUB_SEARCH_REPOS_PATH,
    GITHUB_TOKEN,
    GITHUB_USER_AGENT,
    REDDIT_MAX_ENTRIES_PER_FEED,
    REDDIT_RSS_FEEDS,
    REDDIT_USER_AGENT,
    REQUEST_RETRY_BACKOFF_SECONDS,
    REQUEST_RETRY_COUNT,
    REQUEST_TIMEOUT_SECONDS,
)

logger = logging.getLogger(__name__)


def _http_get_json(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
    timeout: float = REQUEST_TIMEOUT_SECONDS,
) -> dict[str, Any] | None:
    """
    带重试的 GET 请求，解析 JSON 响应。

    Args:
        url: 请求地址。
        headers: 可选请求头。
        params: 可选 query 参数。
        timeout: 超时秒数。

    Returns:
        解析后的 dict；全部重试失败或非 2xx 时返回 None。
    """
    merged_headers = {"Accept": "application/json", "User-Agent": GITHUB_USER_AGENT}
    if headers:
        merged_headers.update(headers)

    last_error: Exception | None = None
    for attempt in range(REQUEST_RETRY_COUNT + 1):
        try:
            response = requests.get(
                url,
                headers=merged_headers,
                params=params,
                timeout=timeout,
            )
            if response.status_code == 403:
                logger.warning(
                    "HTTP 403（可能触发速率限制）: %s — %s",
                    url,
                    response.text[:200],
                )
                return None
            if response.status_code == 422:
                logger.warning(
                    "HTTP 422（查询语法无效）: %s — %s",
                    url,
                    response.text[:200],
                )
                return None
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                logger.error("响应非 JSON 对象: %s", url)
                return None
            return payload
        except requests.RequestException as exc:
            last_error = exc
            logger.warning(
                "HTTP 请求失败 (attempt %d/%d): %s — %s",
                attempt + 1,
                REQUEST_RETRY_COUNT + 1,
                url,
                exc,
            )
            if attempt < REQUEST_RETRY_COUNT:
                time.sleep(REQUEST_RETRY_BACKOFF_SECONDS * (attempt + 1))

    if last_error:
        logger.error("HTTP 请求最终失败: %s", last_error)
    return None


def _chunk_keywords(keywords: list[str], chunk_size: int) -> list[list[str]]:
    """将关键词列表按 chunk_size 分组，满足 GitHub Search OR 上限。"""
    cleaned = [k.strip() for k in keywords if k.strip()]
    if not cleaned:
        return [["AI"]]
    return [cleaned[i : i + chunk_size] for i in range(0, len(cleaned), chunk_size)]


def _build_github_search_query(
    keywords: list[str],
    *,
    pushed_within_days: int = GITHUB_PUSHED_WITHIN_DAYS,
    min_stars: int = GITHUB_MIN_STARS,
) -> str:
    """
    构造 GitHub Search repositories 的 q 参数字符串。

    逻辑：关键词 OR 组合 + pushed 日期过滤 + 最低 star 数。
    keywords 长度应 <= GITHUB_MAX_OR_OPERATORS_PER_QUERY，避免 422。

    Args:
        keywords: 当前批次搜索关键词（建议不超过 5 个 OR 项）。
        pushed_within_days: 仅保留最近 N 天内有 push 的仓库。
        min_stars: 最低 star 门槛。

    Returns:
        GitHub Search API 的 q 查询字符串。
    """
    quoted = []
    for kw in keywords:
        token = kw.strip()
        if not token:
            continue
        if " " in token:
            quoted.append(f'"{token}"')
        else:
            quoted.append(token)

    keyword_clause = " OR ".join(quoted) if quoted else "AI"
    since = (
        datetime.now(timezone.utc) - timedelta(days=pushed_within_days)
    ).strftime("%Y-%m-%d")
    return f"({keyword_clause}) pushed:>{since} stars:>={min_stars}"


def _search_github_repos(
    query: str,
    *,
    token: str | None,
    per_page: int,
) -> list[dict[str, Any]]:
    """执行单次 GitHub Search API 请求并返回 items 原始 dict 列表。"""
    url = f"{GITHUB_API_BASE}{GITHUB_SEARCH_REPOS_PATH}"
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    params = {
        "q": query,
        "sort": "stars",
        "order": "desc",
        "per_page": min(max(per_page, 1), 100),
    }

    payload = _http_get_json(url, headers=headers, params=params)
    if not payload:
        return []

    items = payload.get("items")
    return items if isinstance(items, list) else []


def _repo_to_record(repo: dict[str, Any]) -> dict[str, Any] | None:
    """将 GitHub API repo 对象转为 pipeline 统一结构。"""
    full_name = repo.get("full_name") or repo.get("name") or ""
    if not full_name:
        return None
    return {
        "source": "github",
        "id": full_name,
        "title": repo.get("name") or full_name,
        "description": (repo.get("description") or "").strip(),
        "url": repo.get("html_url") or "",
        "stars": repo.get("stargazers_count") or 0,
        "language": repo.get("language") or "",
        "pushed_at": repo.get("pushed_at") or "",
        "topics": repo.get("topics") or [],
    }


def fetch_github_trending(
    *,
    keywords: list[str] | None = None,
    token: str | None = GITHUB_TOKEN,
    per_page: int = GITHUB_SEARCH_PER_PAGE,
    pushed_within_days: int = GITHUB_PUSHED_WITHIN_DAYS,
    min_stars: int = GITHUB_MIN_STARS,
) -> list[dict[str, Any]]:
    """
    通过 GitHub 官方 Search API 抓取近期最热门的 AI / Prompt 相关仓库。

    GitHub 无独立 Trending REST 端点，此处用「近 N 天 push + 关键词 + 按 stars 降序」
    近似当日热门。需合规使用 API 并遵守速率限制；建议配置 GITHUB_TOKEN。

    Args:
        keywords: 覆盖默认 AI 关键词列表；None 使用 config.GITHUB_AI_KEYWORDS。
        token: GitHub PAT；None 时以匿名身份请求（速率更低）。
        per_page: 返回条数上限，最大 100。
        pushed_within_days: 仅搜索最近 N 天有 push 的仓库。
        min_stars: 过滤低 star 仓库。

    Returns:
        标准化字典列表，每项字段：
        - source: 固定为 "github"
        - id: 仓库 full_name（唯一键）
        - title: 仓库名
        - description: 简介
        - url: html_url
        - stars: star 总数
        - language: 主语言
        - pushed_at: 最近 push 时间 ISO 字符串
        - topics: topic 标签列表
        抓取失败时返回空列表。
    """
    kw_list = keywords or GITHUB_AI_KEYWORDS
    batches = _chunk_keywords(kw_list, GITHUB_MAX_OR_OPERATORS_PER_QUERY)

    merged: dict[str, dict[str, Any]] = {}
    try:
        for batch in batches:
            query = _build_github_search_query(
                batch,
                pushed_within_days=pushed_within_days,
                min_stars=min_stars,
            )
            logger.info("GitHub Search: q=%s", query)
            for repo in _search_github_repos(query, token=token, per_page=per_page):
                if not isinstance(repo, dict):
                    continue
                record = _repo_to_record(repo)
                if record:
                    merged[record["id"]] = record
            # 多批次查询时间隔，降低触发 secondary rate limit 风险
            if len(batches) > 1:
                time.sleep(1.0)
    except Exception as exc:  # noqa: BLE001
        logger.exception("fetch_github_trending 未预期异常: %s", exc)
        return []

    results = sorted(merged.values(), key=lambda x: x.get("stars", 0), reverse=True)
    if per_page > 0:
        results = results[:per_page]

    logger.info("GitHub 抓取完成，共 %d 条", len(results))
    return results


def _parse_reddit_entry(entry: Any, subreddit: str) -> dict[str, Any] | None:
    """
    将 feedparser entry 转为统一结构。

    Args:
        entry: feedparser 解析出的单条 entry。
        subreddit: 来源 subreddit 名称。

    Returns:
        标准化 dict；无法解析时返回 None。
    """
    try:
        title = (getattr(entry, "title", None) or "").strip()
        link = (getattr(entry, "link", None) or "").strip()
        if not title or not link:
            return None

        published = getattr(entry, "published", "") or getattr(entry, "updated", "") or ""
        summary = getattr(entry, "summary", "") or ""
        # Reddit RSS summary 常含 HTML，仅做简单截断
        if len(summary) > 500:
            summary = summary[:500] + "…"

        entry_id = getattr(entry, "id", None) or link
        author = getattr(entry, "author", "") or ""

        return {
            "source": "reddit",
            "id": entry_id,
            "subreddit": subreddit,
            "title": title,
            "description": summary,
            "url": link,
            "author": author,
            "published": published,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("解析 Reddit entry 失败 (%s): %s", subreddit, exc)
        return None


def fetch_reddit_prompts(
    *,
    feeds: list[tuple[str, str]] | None = None,
    max_entries_per_feed: int = REDDIT_MAX_ENTRIES_PER_FEED,
    user_agent: str = REDDIT_USER_AGENT,
    timeout: float = REQUEST_TIMEOUT_SECONDS,
) -> list[dict[str, Any]]:
    """
    通过 feedparser 解析 Reddit Top RSS（标准 XML），获取 Prompt / AI 相关热帖。

    不直接请求 Reddit HTML 页面，仅消费公开 RSS 订阅，符合 Reddit 对 RSS 的使用方式。
    单个 feed 失败不影响其他 feed。

    Args:
        feeds: (subreddit, rss_url) 列表；None 时使用 config.REDDIT_RSS_FEEDS。
        max_entries_per_feed: 每个 subreddit 最多保留帖子数。
        user_agent: RSS 请求 User-Agent，须可识别应用身份。
        timeout: 单次 HTTP 超时（秒）；feedparser 通过 requests 会话间接使用。

    Returns:
        标准化字典列表，字段含 source/id/subreddit/title/description/url/author/published。
        全部 feed 失败时返回空列表。
    """
    feed_list = feeds or REDDIT_RSS_FEEDS
    all_posts: list[dict[str, Any]] = []

    for subreddit, rss_url in feed_list:
        try:
            logger.info("Reddit RSS: r/%s — %s", subreddit, rss_url)
            # feedparser 6.x 支持将 session 作为 agent 传入以复用 UA
            parsed = feedparser.parse(
                rss_url,
                agent=user_agent,
                request_headers={"User-Agent": user_agent},
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Reddit RSS 解析异常 r/%s: %s", subreddit, exc)
            continue

        if getattr(parsed, "bozo", False):
            bozo_exc = getattr(parsed, "bozo_exception", None)
            logger.warning(
                "Reddit RSS 格式警告 r/%s: %s",
                subreddit,
                bozo_exc,
            )
            # bozo 时仍尝试读取 entries（部分 feed 可容错）

        entries = getattr(parsed, "entries", []) or []
        count = 0
        for entry in entries:
            if count >= max_entries_per_feed:
                break
            record = _parse_reddit_entry(entry, subreddit)
            if record:
                all_posts.append(record)
                count += 1

        logger.info("r/%s 抓取 %d 条", subreddit, count)

    logger.info("Reddit 合计 %d 条", len(all_posts))
    return all_posts


def fetch_all_sources(
    *,
    github_keywords: list[str] | None = None,
    github_token: str | None = GITHUB_TOKEN,
    reddit_feeds: list[tuple[str, str]] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """
    并行语义下的统一入口：依次调用 GitHub 与 Reddit 抓取，分别容错。

    Args:
        github_keywords: 传给 fetch_github_trending 的关键词。
        github_token: GitHub PAT。
        reddit_feeds: Reddit RSS 列表。

    Returns:
        {"github": [...], "reddit": [...]}；任一侧失败对应值为 []。
    """
    github_items: list[dict[str, Any]] = []
    reddit_items: list[dict[str, Any]] = []

    try:
        github_items = fetch_github_trending(
            keywords=github_keywords,
            token=github_token,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("fetch_github_trending 顶层捕获: %s", exc)

    try:
        reddit_items = fetch_reddit_prompts(feeds=reddit_feeds)
    except Exception as exc:  # noqa: BLE001
        logger.exception("fetch_reddit_prompts 顶层捕获: %s", exc)

    return {"github": github_items, "reddit": reddit_items}
