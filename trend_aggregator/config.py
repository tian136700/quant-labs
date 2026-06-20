"""
trend_aggregator 全局配置模块。

集中管理 API 密钥、RSS 源、关键词列表及 HTTP / LLM 相关参数。
敏感信息优先从环境变量读取，避免硬编码进版本库。
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path

_MODULE_DIR = Path(__file__).resolve().parent


def _load_local_env() -> None:
    """
    从 trend_aggregator/.env.local 加载 KEY=VALUE 到 os.environ。

    已存在的环境变量不会被覆盖（便于 shell export 优先）。
    """
    env_path = _MODULE_DIR / ".env.local"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_local_env()

# ---------------------------------------------------------------------------
# GitHub API
# ---------------------------------------------------------------------------

# 可选：设置后可提升 Search API 速率上限（未认证约 10 次/分钟，认证约 30 次/分钟）
GITHUB_TOKEN: str | None = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN")

GITHUB_API_BASE = "https://api.github.com"
GITHUB_SEARCH_REPOS_PATH = "/search/repositories"

# 搜索 AI / Prompt 相关仓库时使用的关键词（OR 组合进 GitHub Search query）
GITHUB_AI_KEYWORDS: list[str] = [
    "AI",
    "LLM",
    "GPT",
    "prompt",
    "ChatGPT",
    "Claude",
    "openai",
    "langchain",
    "RAG",
    "agent",
    "copilot",
]

# 仅保留最近 N 天内 push 过的仓库，近似「当日热门」
GITHUB_PUSHED_WITHIN_DAYS: int = 1

# 最低 star 数，过滤噪声小项目
GITHUB_MIN_STARS: int = 10

# GitHub Search API 单次 query 最多 5 个 AND/OR/NOT 运算符
GITHUB_MAX_OR_OPERATORS_PER_QUERY: int = 5

# 单次 Search API 最多返回条数（GitHub 上限 100）
GITHUB_SEARCH_PER_PAGE: int = 30

# ---------------------------------------------------------------------------
# Reddit RSS（标准 XML 订阅，不爬 HTML 页面）
# ---------------------------------------------------------------------------

# 每个条目为 (subreddit, RSS URL)；t=day 表示当日 Top
REDDIT_RSS_FEEDS: list[tuple[str, str]] = [
    ("ChatGPT", "https://www.reddit.com/r/ChatGPT/top/.rss?t=day"),
    ("PromptEngineering", "https://www.reddit.com/r/PromptEngineering/top/.rss?t=day"),
    ("LocalLLaMA", "https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day"),
    ("OpenAI", "https://www.reddit.com/r/OpenAI/top/.rss?t=day"),
]

# Reddit 要求 RSS 请求携带可识别的 User-Agent（勿伪装浏览器爬取 HTML）
REDDIT_USER_AGENT: str = os.getenv(
    "REDDIT_USER_AGENT",
    "trend-aggregator/1.0 (Python feedparser; contact: admin@info-quests.com)",
)

# 每个 subreddit RSS 最多保留的帖子数
REDDIT_MAX_ENTRIES_PER_FEED: int = 15

# ---------------------------------------------------------------------------
# 大模型 API（pipeline 中 generate_seo_article 使用）
# ---------------------------------------------------------------------------

LLM_PROVIDER: str = os.getenv("TREND_LLM_PROVIDER", "deepseek")  # deepseek | openai

DEEPSEEK_API_KEY: str | None = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_API_BASE: str = os.getenv("DEEPSEEK_API_BASE", "https://api.deepseek.com")
DEEPSEEK_MODEL: str = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")
OPENAI_API_BASE: str = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# ---------------------------------------------------------------------------
# HTTP 通用
# ---------------------------------------------------------------------------

REQUEST_TIMEOUT_SECONDS: float = 30.0
REQUEST_RETRY_COUNT: int = 2
REQUEST_RETRY_BACKOFF_SECONDS: float = 2.0

# GitHub API 推荐携带可识别 UA
GITHUB_USER_AGENT: str = os.getenv(
    "GITHUB_USER_AGENT",
    "trend-aggregator/1.0 (GitHub Search API client)",
)

# ---------------------------------------------------------------------------
# 数据清洗 / 去重
# ---------------------------------------------------------------------------

# 标题相似度去重阈值（0~1，基于 difflib.SequenceMatcher）
DEDUP_TITLE_SIMILARITY_THRESHOLD: float = 0.85

# 原始数据 JSON 默认输出路径（相对 trend_aggregator 目录）
DEFAULT_RAW_OUTPUT_PATH = "output/raw_trends.json"
DEFAULT_ARTICLE_OUTPUT_PATH = "output/seo_article.md"


@dataclass
class AggregatorConfig:
    """
    运行时配置快照，便于 pipeline 注入测试参数而无需改全局常量。

    Attributes:
        github_token: GitHub Personal Access Token，可为 None。
        github_keywords: 仓库搜索关键词列表。
        reddit_feeds: (subreddit 名, RSS URL) 元组列表。
        llm_provider: 大模型供应商标识。
        request_timeout: HTTP 超时秒数。
    """

    github_token: str | None = GITHUB_TOKEN
    github_keywords: list[str] = field(default_factory=lambda: list(GITHUB_AI_KEYWORDS))
    reddit_feeds: list[tuple[str, str]] = field(
        default_factory=lambda: list(REDDIT_RSS_FEEDS)
    )
    llm_provider: str = LLM_PROVIDER
    request_timeout: float = REQUEST_TIMEOUT_SECONDS
    pushed_within: timedelta = field(
        default_factory=lambda: timedelta(days=GITHUB_PUSHED_WITHIN_DAYS)
    )


def get_default_config() -> AggregatorConfig:
    """返回一份基于模块级常量的默认 AggregatorConfig 实例。"""
    return AggregatorConfig()
