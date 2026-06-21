"""
将 trend_aggregator 抓取结果 POST 到 Next.js /api/trends/ingest 写入 D1。

认证：Bearer ``JP_REVIEW_UPLOAD_TOKEN``（与日语复习 PDF 上传共用）。
本地无 token 时，127.0.0.1 / localhost 可免认证（与 jp-review 一致）。
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

from prompts import attach_prompts_to_items, build_full_prompt
from selection import select_top_items

logger = logging.getLogger(__name__)

DEFAULT_INGEST_URL = os.getenv(
    "TREND_INGEST_URL",
    "http://127.0.0.1:3002/api/trends/ingest",
)


def _upload_token() -> str:
    return (
        os.getenv("TREND_UPLOAD_TOKEN")
        or os.getenv("JP_REVIEW_UPLOAD_TOKEN")
        or ""
    ).strip()


def build_ingest_payload(
    raw: dict[str, list[dict[str, Any]]],
    processed: dict[str, Any],
    *,
    fetched_at: str | None = None,
) -> dict[str, Any]:
    """
    组装写入 API 的 JSON body：全量 raw + processed，Top-10 及 **一条** 完整 AI 提示词。
    """
    selected = select_top_items(processed)
    ts = fetched_at or datetime.now(timezone.utc).isoformat()
    full_prompt = build_full_prompt(selected, fetched_at=ts)
    selected_with_prompts = attach_prompts_to_items(selected, fetched_at=ts)

    stats = processed.get("stats") or {}

    return {
        "fetched_at": ts,
        "github_count": int(stats.get("github") or len(processed.get("github") or [])),
        "reddit_count": int(stats.get("reddit") or len(processed.get("reddit") or [])),
        "combined_count": int(stats.get("combined") or len(processed.get("combined") or [])),
        "raw": raw,
        "processed": processed,
        "selected": selected_with_prompts,
        "batch_full_prompt": full_prompt,
    }


def sync_to_api(
    payload: dict[str, Any],
    *,
    ingest_url: str | None = None,
    token: str | None = None,
    timeout: float = 60.0,
) -> dict[str, Any]:
    """
    POST payload 到 ingest API。

    Returns:
        API 响应 JSON（含 run_id 等）。

    Raises:
        RuntimeError: HTTP 非 2xx 或网络失败。
    """
    url = (ingest_url or DEFAULT_INGEST_URL).strip()
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "trend-aggregator/1.0 (sync)",
    }
    tok = (token if token is not None else _upload_token()).strip()
    if tok:
        headers["Authorization"] = f"Bearer {tok}"

    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if not isinstance(data, dict):
                raise RuntimeError("ingest 响应非 JSON 对象")
            return data
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"ingest HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"ingest 网络错误: {exc}") from exc


def sync_pipeline_result(
    raw: dict[str, list[dict[str, Any]]],
    processed: dict[str, Any],
    *,
    fetched_at: str | None = None,
    ingest_url: str | None = None,
    token: str | None = None,
) -> dict[str, Any]:
    """抓取流水线完成后调用：构建 payload 并同步到数据库。"""
    payload = build_ingest_payload(raw, processed, fetched_at=fetched_at)
    result = sync_to_api(payload, ingest_url=ingest_url, token=token)
    logger.info(
        "趋势数据已入库 run_id=%s selected=%d",
        result.get("run_id"),
        len(payload.get("selected") or []),
    )
    return result
