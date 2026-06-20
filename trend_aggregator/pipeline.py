"""
trend_aggregator 主控流水线。

职责：调度 fetchers 抓取 → 清洗去重 → 调用大模型生成 SEO 英文文章（可开关）。
"""

from __future__ import annotations

import json
import logging
import re
import sys
import time
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
    REQUEST_RETRY_BACKOFF_SECONDS,
    REQUEST_RETRY_COUNT,
    REQUEST_TIMEOUT_SECONDS,
    AggregatorConfig,
    get_default_config,
)
from fetchers import fetch_all_sources

logger = logging.getLogger(__name__)

MODULE_DIR = Path(__file__).resolve().parent

# OpenAI 兼容 Chat Completions 的 System Prompt（英文输出）
BLOG_SYSTEM_PROMPT = """You are a senior developer advocate and technical SEO editor.

Your task: turn raw GitHub trending project data into a polished, SEO-friendly English technical blog post in Markdown.

Requirements:
1. Start with an HTML comment meta description: <!-- meta: one sentence under 160 chars -->
2. Use a compelling H1 title, then H2/H3 sections (Overview, Top Projects, Use Cases, Prompt Examples, Conclusion)
3. Length: 800–1200 words
4. For each highlighted project, briefly explain what it does and who should use it
5. Include at least 2 practical "Use Case" bullets and 1–2 copy-paste AI prompt examples readers can try
6. Weave natural keywords: AI, LLM, GitHub trends, open source, prompts, agents
7. Do NOT invent repositories, star counts, or features not present in the source data
8. Output Markdown only — no preamble like "Here is the article"
"""


class BlogGenerationError(RuntimeError):
    """大模型文章生成失败时抛出，携带可读错误信息。"""


def _extract_github_items(json_data: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    从多种 JSON 结构中提取 GitHub 项目列表。

    支持：项目 list、raw_trends.json 完整结构（raw.github / processed.github）。
    """
    if isinstance(json_data, list):
        return [x for x in json_data if isinstance(x, dict)]

    if not isinstance(json_data, dict):
        raise ValueError("json_data 须为 dict 或 list")

    for key_path in (
        ("processed", "github"),
        ("raw", "github"),
        ("github",),
    ):
        node: Any = json_data
        ok = True
        for key in key_path:
            if not isinstance(node, dict) or key not in node:
                ok = False
                break
            node = node[key]
        if ok and isinstance(node, list):
            return [x for x in node if isinstance(x, dict)]

    raise ValueError(
        "无法从 JSON 中定位 GitHub 数据，期望 list 或含 raw.github / processed.github 的结构"
    )


def parse_github_json(json_data: dict[str, Any] | list[dict[str, Any]]) -> str:
    """
    从 GitHub JSON 提取项目名称、描述、Stars、Topics，拼接为供 LLM 使用的精简文本。

    Args:
        json_data: 完整 ``raw_trends.json`` 字典，或 GitHub 项目 dict 列表。
            每条记录字段：id/title、description、stars、topics、url（可选）。

    Returns:
        多项目块用 ``---`` 分隔的精简英文汇总；无数据时返回空字符串。

    Raises:
        ValueError: JSON 结构无法解析时。
    """
    items = _extract_github_items(json_data)
    if not items:
        logger.warning("parse_github_json: 无 GitHub 项目")
        return ""

    blocks: list[str] = []
    for idx, item in enumerate(items, start=1):
        name = str(item.get("id") or item.get("title") or "unknown").strip()
        desc = str(item.get("description") or "").strip() or "(no description)"
        stars = item.get("stars", 0)
        try:
            stars_fmt = f"{int(stars):,}"
        except (TypeError, ValueError):
            stars_fmt = str(stars)

        topics_raw = item.get("topics") or []
        if isinstance(topics_raw, list):
            topics = ", ".join(str(t).strip() for t in topics_raw if str(t).strip())
        else:
            topics = str(topics_raw).strip()
        topics_line = topics if topics else "(none)"

        url = str(item.get("url") or "").strip()
        url_line = f"URL: {url}" if url else ""

        block = (
            f"#{idx} {name} | Stars: {stars_fmt}\n"
            f"Description: {desc}\n"
            f"Topics: {topics_line}"
        )
        if url_line:
            block += f"\n{url_line}"
        blocks.append(block)

    parsed = "\n---\n".join(blocks)
    logger.info("parse_github_json: 已解析 %d 个项目，文本长度 %d", len(items), len(parsed))
    return parsed


def _resolve_llm_credentials(
    provider: str | None = None,
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> tuple[str, str, str, str]:
    """
    解析 LLM 调用凭证与端点。

    Returns:
        (provider, api_key, chat_completions_url, model)
    """
    chosen = (provider or LLM_PROVIDER).lower()

    if chosen == "deepseek":
        key = api_key or DEEPSEEK_API_KEY
        base = (base_url or DEEPSEEK_API_BASE).rstrip("/")
        mdl = model or DEEPSEEK_MODEL
        url = f"{base}/v1/chat/completions"
    elif chosen == "openai":
        key = api_key or OPENAI_API_KEY
        base = (base_url or OPENAI_API_BASE).rstrip("/")
        mdl = model or OPENAI_MODEL
        url = f"{base}/chat/completions"
    else:
        raise BlogGenerationError(f"不支持的 LLM provider: {chosen}")

    if not key:
        raise BlogGenerationError(
            f"未配置 {chosen} API Key，请在 .env.local 设置 "
            f"{'DEEPSEEK_API_KEY' if chosen == 'deepseek' else 'OPENAI_API_KEY'}"
        )

    return chosen, key, url, mdl


def generate_blog_post(
    parsed_text: str,
    *,
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
    timeout: float = REQUEST_TIMEOUT_SECONDS,
    max_retries: int = REQUEST_RETRY_COUNT,
) -> str:
    """
    调用 OpenAI 兼容 Chat Completions API，将 GitHub 精简文本生成 SEO 英文 Markdown 博客。

    默认使用 config 中的 DeepSeek 配置（``DEEPSEEK_API_KEY`` / ``DEEPSEEK_API_BASE`` /
    ``DEEPSEEK_MODEL``）；也可传入参数或切换 ``provider='openai'``。

    Args:
        parsed_text: ``parse_github_json`` 产出的项目汇总文本。
        provider: ``deepseek`` 或 ``openai``；None 时使用 ``config.LLM_PROVIDER``。
        api_key: 覆盖默认 API Key。
        base_url: 覆盖默认 API Base URL。
        model: 覆盖默认模型名。
        timeout: 单次 HTTP 超时（秒）。
        max_retries: 失败后额外重试次数（不含首次请求）。

    Returns:
        Markdown 格式博客正文。

    Raises:
        BlogGenerationError: 输入为空、未配置 Key、或重试耗尽仍失败。
    """
    text = (parsed_text or "").strip()
    if not text:
        raise BlogGenerationError("parsed_text 为空，无法生成文章")

    _, key, url, mdl = _resolve_llm_credentials(
        provider,
        api_key=api_key,
        base_url=base_url,
        model=model,
    )

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": mdl,
        "messages": [
            {"role": "system", "content": BLOG_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Transform the following GitHub trending AI project data into "
                    "the blog post described in your instructions.\n\n"
                    f"{text}"
                ),
            },
        ],
        "temperature": 0.7,
    }

    last_error: Exception | None = None
    attempts = max_retries + 1

    for attempt in range(1, attempts + 1):
        try:
            logger.info(
                "generate_blog_post: 请求 %s (attempt %d/%d)",
                url,
                attempt,
                attempts,
            )
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=timeout,
            )

            if response.status_code in {429, 500, 502, 503, 504}:
                raise requests.HTTPError(
                    f"HTTP {response.status_code}: {response.text[:300]}",
                    response=response,
                )

            response.raise_for_status()
            data = response.json()

            choices = data.get("choices") or []
            if not choices:
                raise BlogGenerationError("LLM 响应缺少 choices 字段")

            message = choices[0].get("message") or {}
            content = message.get("content")
            if not content or not str(content).strip():
                raise BlogGenerationError("LLM 响应 content 为空")

            article = str(content).strip()
            logger.info("generate_blog_post: 成功，文章长度 %d 字符", len(article))
            return article

        except requests.HTTPError as exc:
            last_error = exc
            status = exc.response.status_code if exc.response is not None else None
            # 4xx（除 429）通常不可重试
            if status is not None and 400 <= status < 500 and status != 429:
                logger.error("generate_blog_post: 不可重试的 HTTP 错误 %s", status)
                raise BlogGenerationError(f"LLM API 请求失败: {exc}") from exc
            logger.warning("generate_blog_post: HTTP 错误 (attempt %d/%d): %s", attempt, attempts, exc)
        except requests.RequestException as exc:
            last_error = exc
            logger.warning(
                "generate_blog_post: 网络错误 (attempt %d/%d): %s",
                attempt,
                attempts,
                exc,
            )
        except (ValueError, KeyError, TypeError) as exc:
            last_error = exc
            logger.warning(
                "generate_blog_post: 响应解析失败 (attempt %d/%d): %s",
                attempt,
                attempts,
                exc,
            )

        if attempt < attempts:
            sleep_sec = REQUEST_RETRY_BACKOFF_SECONDS * attempt
            logger.info("generate_blog_post: %s 秒后重试…", sleep_sec)
            time.sleep(sleep_sec)

    raise BlogGenerationError(
        f"LLM API 在 {attempts} 次尝试后仍失败: {last_error}"
    ) from last_error


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


def generate_seo_article(
    github_json: dict[str, Any] | list[dict[str, Any]],
    *,
    provider: str | None = None,
    dry_run: bool = False,
) -> str | None:
    """
    将 GitHub JSON 数据解析后交给大模型，生成 SEO 英文 Markdown 文章。

    Args:
        github_json: 完整 raw_trends.json、或 GitHub 项目 list、或含 processed/raw 的 dict。
        provider: 覆盖 config.LLM_PROVIDER。
        dry_run: True 时不调用 API，仅记录 prompt 长度。

    Returns:
        Markdown 文章；dry_run 或失败时返回 None（失败会写日志，不抛异常）。
    """
    try:
        parsed = parse_github_json(github_json)
    except ValueError as exc:
        logger.error("generate_seo_article: JSON 解析失败 — %s", exc)
        return None

    if not parsed:
        logger.warning("generate_seo_article: 无 GitHub 数据，跳过")
        return None

    chosen = provider or LLM_PROVIDER
    if dry_run:
        logger.info(
            "dry_run: 将调用 %s 生成博客，parsed_text 长度 %d 字符",
            chosen,
            len(parsed),
        )
        return None

    logger.info("调用 %s 生成 SEO 博客…", chosen)
    try:
        return generate_blog_post(parsed, provider=chosen)
    except BlogGenerationError as exc:
        logger.error("generate_seo_article: %s", exc)
        return None
    except Exception as exc:  # noqa: BLE001
        logger.exception("generate_seo_article 未预期异常: %s", exc)
        return None


def load_json_file(path: Path) -> dict[str, Any]:
    """读取 JSON 文件；格式错误或 IO 失败时抛出异常。"""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON 格式无效: {path}") from exc
    except OSError as exc:
        raise ValueError(f"无法读取文件: {path}") from exc


def generate_article_from_json_file(
    json_path: Path,
    *,
    provider: str | None = None,
    dry_run: bool = False,
    article_output: Path | None = None,
) -> dict[str, Any]:
    """
    从已抓取的 raw_trends.json 直接生成博客，无需重新 fetch。

    Args:
        json_path: JSON 文件路径。
        provider: LLM 供应商标识。
        dry_run: 是否仅预览不调用 API。
        article_output: Markdown 输出路径。

    Returns:
        {"article": str | None, "paths": {"article": str | None}, "parsed_preview_len": int}
    """
    data = load_json_file(json_path)
    parsed = parse_github_json(data)
    art_path = article_output or (MODULE_DIR / DEFAULT_ARTICLE_OUTPUT_PATH)

    article: str | None = None
    if dry_run:
        logger.info("dry_run: parsed_text 长度 %d，跳过 API", len(parsed))
    else:
        article = generate_seo_article(data, provider=provider, dry_run=False)

    art_saved: str | None = None
    if article:
        try:
            save_text(article, art_path)
            art_saved = str(art_path)
        except OSError as exc:
            logger.exception("保存文章失败: %s", exc)

    return {
        "article": article,
        "paths": {"article": art_saved},
        "parsed_preview_len": len(parsed),
    }


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
            {"raw": raw, "processed": processed},
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
    CLI 入口：
      python pipeline.py [--dry-run] [--no-llm] [-v]
      python pipeline.py --from-json output/raw_trends.json [--dry-run]

    Returns:
        进程退出码，0 表示成功。
    """
    args = argv if argv is not None else sys.argv[1:]
    dry_run = "--dry-run" in args
    no_llm = "--no-llm" in args
    verbose = "-v" in args or "--verbose" in args

    _configure_logging(verbose)

    from_json: Path | None = None
    if "--from-json" in args:
        idx = args.index("--from-json")
        if idx + 1 >= len(args):
            print("错误: --from-json 需要指定 JSON 文件路径", file=sys.stderr)
            return 2
        from_json = Path(args[idx + 1])
        if not from_json.is_file():
            print(f"错误: 文件不存在 — {from_json}", file=sys.stderr)
            return 2

    try:
        if from_json is not None:
            result = generate_article_from_json_file(
                from_json,
                dry_run=dry_run,
            )
            if result["paths"]["article"]:
                print(f"Article:  {result['paths']['article']}", flush=True)
            elif dry_run:
                print(
                    f"Dry run OK. parsed_text length={result['parsed_preview_len']}",
                    flush=True,
                )
            else:
                print("Article:  (failed — check DEEPSEEK_API_KEY or logs)", flush=True)
                return 1
            return 0

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
