"""
trend_aggregator 主控流水线。

职责：调度 fetchers 抓取 → 清洗去重 → 调用大模型生成 SEO 英文文章（可开关）。
"""

from __future__ import annotations

import json
import logging
import re
import sys
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import requests

from config import (
    DEEPSEEK_API_BASE,
    DEEPSEEK_API_KEY,
    DEEPSEEK_MODEL,
    DEFAULT_ARTICLE_OUTPUT_PATH,
    DEFAULT_RAW_OUTPUT_PATH,
    DEDUP_TITLE_SIMILARITY_THRESHOLD,
    GITHUB_TOKEN,
    LLM_PROVIDER,
    OPENAI_API_BASE,
    OPENAI_API_KEY,
    OPENAI_MODEL,
    REQUEST_TIMEOUT_SECONDS,
    AggregatorConfig,
    get_default_config,
)
from fetchers import fetch_all_sources

logger = logging.getLogger(__name__)

MODULE_DIR = Path(__file__).resolve().parent


def _normalize_title(title: str) -> str:
    """小写、去标点、压缩空白，供去重比较使用。"""
    text = title.lower().strip()
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _title_similarity(a: str, b: str) -> float:
    """基于 SequenceMatcher 的标题相似度 0~1。"""
    na, nb = _normalize_title(a), _normalize_title(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def deduplicate_items(
    items: list[dict[str, Any]],
    *,
    similarity_threshold: float = DEDUP_TITLE_SIMILARITY_THRESHOLD,
) -> list[dict[str, Any]]:
    """
    对抓取结果去重：优先按 id/url，其次按标题相似度。

    Args:
        items: fetchers 返回的标准化记录列表。
        similarity_threshold: 标题相似度超过该值视为重复，保留先出现的条目。

    Returns:
        去重后的新列表（不修改原列表）。
    """
    seen_ids: set[str] = set()
    seen_urls: set[str] = set()
    kept: list[dict[str, Any]] = []

    for item in items:
        item_id = str(item.get("id") or "").strip()
        url = str(item.get("url") or "").strip().rstrip("/")
        title = str(item.get("title") or "")

        if item_id and item_id in seen_ids:
            continue
        if url and url in seen_urls:
            continue

        duplicate = False
        for existing in kept:
            if _title_similarity(title, str(existing.get("title") or "")) >= similarity_threshold:
                duplicate = True
                break
        if duplicate:
            continue

        if item_id:
            seen_ids.add(item_id)
        if url:
            seen_urls.add(url)
        kept.append(item)

    logger.info("去重: %d → %d", len(items), len(kept))
    return kept


def clean_item(item: dict[str, Any]) -> dict[str, Any]:
    """
    单条记录清洗：strip 字符串、限制 description 长度、移除空字段。

    Args:
        item: 原始抓取记录。

    Returns:
        清洗后的新 dict。
    """
    cleaned: dict[str, Any] = {}
    for key, value in item.items():
        if isinstance(value, str):
            value = value.strip()
            if key == "description" and len(value) > 800:
                value = value[:800] + "…"
        if value in ("", None, [], {}):
            continue
        cleaned[key] = value
    return cleaned


def clean_and_deduplicate(
    raw: dict[str, list[dict[str, Any]]],
    *,
    similarity_threshold: float = DEDUP_TITLE_SIMILARITY_THRESHOLD,
) -> dict[str, Any]:
    """
    合并 GitHub + Reddit 数据，清洗并去重。

    Args:
        raw: fetch_all_sources 返回值，含 github / reddit 键。
        similarity_threshold: 标题相似度去重阈值。

    Returns:
        {
            "github": [...],
            "reddit": [...],
            "combined": [...],   # 合并后去重
            "stats": {"github": n, "reddit": n, "combined": n},
        }
    """
    github_cleaned = [clean_item(x) for x in raw.get("github") or []]
    reddit_cleaned = [clean_item(x) for x in raw.get("reddit") or []]
    combined = deduplicate_items(
        github_cleaned + reddit_cleaned,
        similarity_threshold=similarity_threshold,
    )

    return {
        "github": github_cleaned,
        "reddit": reddit_cleaned,
        "combined": combined,
        "stats": {
            "github": len(github_cleaned),
            "reddit": len(reddit_cleaned),
            "combined": len(combined),
        },
    }


def _build_llm_prompt(items: list[dict[str, Any]], *, max_items: int = 25) -> str:
    """
    将结构化趋势数据压缩为 LLM 用户提示词。

    Args:
        items: 清洗去重后的 combined 列表。
        max_items: 最多纳入条数，控制 token 用量。

    Returns:
        英文 prompt 字符串。
    """
    lines: list[str] = []
    for idx, item in enumerate(items[:max_items], start=1):
        source = item.get("source", "unknown")
        title = item.get("title", "")
        desc = item.get("description", "")
        url = item.get("url", "")
        extra = ""
        if source == "github":
            extra = f" | stars={item.get('stars', 0)} lang={item.get('language', '')}"
        elif source == "reddit":
            extra = f" | r/{item.get('subreddit', '')}"
        lines.append(f"{idx}. [{source}] {title}{extra}\n   {desc}\n   {url}")

    body = "\n".join(lines) if lines else "(no data)"
    return (
        "Below is today's aggregated AI / prompt engineering trend data from GitHub "
        "and Reddit.\n\n"
        f"{body}\n\n"
        "Write a polished SEO-friendly English blog article (800–1200 words) that:\n"
        "- Has a compelling H1 title and H2/H3 subheadings in Markdown\n"
        "- Summarizes key themes and actionable takeaways for developers\n"
        "- Naturally weaves in relevant keywords (AI, LLM, prompts, GitHub trends)\n"
        "- Includes a short meta description at the top as HTML comment "
        "<!-- meta: ... -->\n"
        "- Does NOT invent facts not supported by the source list\n"
    )


def _call_chat_completions(
    *,
    provider: str,
    prompt: str,
    timeout: float = REQUEST_TIMEOUT_SECONDS,
) -> str | None:
    """
    调用 OpenAI 兼容 Chat Completions API（DeepSeek / OpenAI）。

    Args:
        provider: "deepseek" 或 "openai"。
        prompt: 用户消息内容。
        timeout: HTTP 超时秒数。

    Returns:
        模型生成的正文；失败返回 None。
    """
    if provider == "deepseek":
        api_key = DEEPSEEK_API_KEY
        base = DEEPSEEK_API_BASE.rstrip("/")
        model = DEEPSEEK_MODEL
        url = f"{base}/v1/chat/completions"
    elif provider == "openai":
        api_key = OPENAI_API_KEY
        base = OPENAI_API_BASE.rstrip("/")
        model = OPENAI_MODEL
        url = f"{base}/chat/completions"
    else:
        logger.error("未知 LLM provider: %s", provider)
        return None

    if not api_key:
        logger.warning("未配置 %s API Key，跳过文章生成", provider)
        return None

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an expert tech editor specializing in AI trends "
                    "and developer tooling. Output Markdown only."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=timeout)
        response.raise_for_status()
        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            logger.error("LLM 响应无 choices")
            return None
        message = choices[0].get("message") or {}
        content = message.get("content")
        if not content:
            logger.error("LLM 响应 content 为空")
            return None
        return str(content).strip()
    except requests.RequestException as exc:
        logger.exception("LLM API 请求失败: %s", exc)
        return None
    except (ValueError, KeyError, TypeError) as exc:
        logger.exception("LLM 响应解析失败: %s", exc)
        return None


def generate_seo_article(
    items: list[dict[str, Any]],
    *,
    provider: str | None = None,
    dry_run: bool = False,
) -> str | None:
    """
    将原始趋势数据交给大模型，生成 SEO 英文 Markdown 文章。

    此为 pipeline 对外预留的核心 LLM 接口；无 API Key 或 dry_run=True 时
    仅记录日志并返回 None，不抛异常。

    Args:
        items: clean_and_deduplicate 产出的 combined 列表。
        provider: 覆盖 config.LLM_PROVIDER；支持 deepseek / openai。
        dry_run: True 时不实际调用 API，只打印 prompt 摘要。

    Returns:
        Markdown 文章字符串；跳过或失败时返回 None。
    """
    if not items:
        logger.warning("generate_seo_article: 无数据，跳过")
        return None

    chosen = provider or LLM_PROVIDER
    prompt = _build_llm_prompt(items)

    if dry_run:
        logger.info(
            "dry_run: 将调用 %s，prompt 长度 %d 字符",
            chosen,
            len(prompt),
        )
        return None

    logger.info("调用 %s 生成 SEO 文章…", chosen)
    try:
        return _call_chat_completions(provider=chosen, prompt=prompt)
    except Exception as exc:  # noqa: BLE001
        logger.exception("generate_seo_article 未预期异常: %s", exc)
        return None


def save_json(data: Any, path: Path) -> None:
    """将 data 写入 JSON 文件，自动创建父目录。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("已写入 %s", path)


def save_text(text: str, path: Path) -> None:
    """将文本写入文件，自动创建父目录。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    logger.info("已写入 %s", path)


def run_pipeline(
    *,
    config: AggregatorConfig | None = None,
    generate_article: bool = True,
    dry_run_llm: bool = False,
    raw_output: Path | None = None,
    article_output: Path | None = None,
) -> dict[str, Any]:
    """
    执行完整聚合流水线。

    流程：
    1. fetch_all_sources 抓取 GitHub + Reddit
    2. clean_and_deduplicate 清洗去重
    3. 可选 generate_seo_article 生成英文 SEO 文章
    4. 可选写入 output/ 目录

    Args:
        config: 运行时配置；None 使用 get_default_config()。
        generate_article: 是否调用 LLM 生成文章。
        dry_run_llm: True 时不调用 LLM，仅记录 prompt。
        raw_output: 原始+清洗 JSON 输出路径；None 使用默认相对路径。
        article_output: Markdown 文章输出路径；None 使用默认相对路径。

    Returns:
        {
            "raw": fetch 结果,
            "processed": clean_and_deduplicate 结果,
            "article": str | None,
            "paths": {"raw": str | None, "article": str | None},
        }
    """
    cfg = config or get_default_config()
    raw_path = raw_output or (MODULE_DIR / DEFAULT_RAW_OUTPUT_PATH)
    art_path = article_output or (MODULE_DIR / DEFAULT_ARTICLE_OUTPUT_PATH)

    logger.info("=== trend_aggregator pipeline 开始 ===")

    raw = fetch_all_sources(
        github_keywords=cfg.github_keywords,
        github_token=cfg.github_token or GITHUB_TOKEN,
        reddit_feeds=cfg.reddit_feeds,
    )

    processed = clean_and_deduplicate(raw)

    article: str | None = None
    if generate_article:
        article = generate_seo_article(
            processed["combined"],
            provider=cfg.llm_provider,
            dry_run=dry_run_llm,
        )

    try:
        save_json(
            {
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "raw": raw,
                "processed": processed,
            },
            raw_path,
        )
        raw_saved = str(raw_path)
    except OSError as exc:
        logger.exception("保存 raw JSON 失败: %s", exc)
        raw_saved = None

    art_saved: str | None = None
    if article:
        try:
            save_text(article, art_path)
            art_saved = str(art_path)
        except OSError as exc:
            logger.exception("保存文章失败: %s", exc)

    logger.info(
        "=== pipeline 完成 | github=%d reddit=%d combined=%d ===",
        processed["stats"]["github"],
        processed["stats"]["reddit"],
        processed["stats"]["combined"],
    )

    return {
        "raw": raw,
        "processed": processed,
        "article": article,
        "paths": {"raw": raw_saved, "article": art_saved},
    }


def _configure_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def main(argv: list[str] | None = None) -> int:
    """
    CLI 入口：python pipeline.py [--dry-run] [--no-llm] [-v]

    Returns:
        进程退出码，0 表示成功。
    """
    args = argv if argv is not None else sys.argv[1:]
    dry_run = "--dry-run" in args
    no_llm = "--no-llm" in args
    verbose = "-v" in args or "--verbose" in args

    _configure_logging(verbose)

    try:
        result = run_pipeline(
            generate_article=not no_llm,
            dry_run_llm=dry_run,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("pipeline 致命错误: %s", exc)
        return 1

    stats = result["processed"]["stats"]
    print(
        f"Done. github={stats['github']} reddit={stats['reddit']} "
        f"combined={stats['combined']}",
        flush=True,
    )
    if result["paths"]["raw"]:
        print(f"Raw JSON: {result['paths']['raw']}", flush=True)
    if result["paths"]["article"]:
        print(f"Article:  {result['paths']['article']}", flush=True)
    elif not no_llm and not dry_run:
        print("Article:  (skipped — check API key or logs)", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
