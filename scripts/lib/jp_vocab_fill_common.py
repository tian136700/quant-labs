#!/usr/bin/env python3
"""日语词条补全共用：鉴权、Worker API。"""

from __future__ import annotations

import os
from pathlib import Path

from worker_fill_http import post_worker_fill_api  # noqa: E402

DEFAULT_BASE = "https://finance.info-quests.com"


def load_env_file(name: str) -> dict[str, str]:
    cfg_path = Path.home() / ".config" / "info-quests" / name
    data: dict[str, str] = {}
    if not cfg_path.is_file():
        return data
    for line in cfg_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def resolve_token() -> str:
    return (
        os.environ.get("JP_REVIEW_UPLOAD_TOKEN", "").strip()
        or load_env_file("jp-review-sync.env").get("JP_REVIEW_UPLOAD_TOKEN", "")
    ).strip()


def call_api(
    url: str,
    token: str,
    payload: dict,
    *,
    user_agent: str = "jp-vocab-fill/1.0",
    timeout: int = 180,
    retries: int = 6,
) -> dict:
    return post_worker_fill_api(
        url,
        token,
        payload,
        user_agent=user_agent,
        timeout=timeout,
        retries=retries,
    )
