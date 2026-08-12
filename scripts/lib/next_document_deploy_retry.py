"""Next.js Collecting page data 阶段 /_document ENOENT 偶发失败。

常见于 .next 争用或 Node 偶发；不是业务代码错误。git-quick-commit 与
wait_deploy_result / deploy-auto-fix 共用本判定，失败后应清缓存重试或重新入队，
禁止当成业务 bug 改页面。
"""

from __future__ import annotations

import os


def is_next_document_collect_flake(output: str) -> bool:
    """next build 在 Collecting page data 阶段偶发 /_document ENOENT。"""
    text = output or ""
    if "Cannot find module for page: /_document" not in text:
        return False
    return (
        "PageNotFoundError" in text
        or "Collecting page data" in text
        or "ENOENT" in text
    )


def next_document_deploy_retry_count() -> int:
    """单次 npm run deploy 内对 /_document flake 的额外重试次数（默认 3）。"""
    raw = os.environ.get("NEXT_DOCUMENT_DEPLOY_RETRIES", "3").strip() or "3"
    try:
        n = int(raw)
    except ValueError:
        return 3
    return max(0, min(n, 5))


def is_deploy_transient_republish_failure(output: str) -> bool:
    """失败日志只需重新入队、不必改业务代码。"""
    if is_next_document_collect_flake(output):
        return True
    try:
        from lib.cloudflare_deploy_retry import (  # type: ignore
            is_cloudflare_api_transient_deploy_failure,
        )
    except ImportError:
        try:
            from cloudflare_deploy_retry import (  # type: ignore
                is_cloudflare_api_transient_deploy_failure,
            )
        except ImportError:
            return False
    return bool(is_cloudflare_api_transient_deploy_failure(output))


def hub_transient_republish_max() -> int:
    """维护中心层：瞬时失败后再 POST publish 的次数上限。"""
    raw = os.environ.get("DEPLOY_TRANSIENT_REPUBLISH_MAX", "2").strip() or "2"
    try:
        n = int(raw)
    except ValueError:
        return 2
    return max(0, min(n, 5))
