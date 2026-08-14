"""Next.js 构建缓存偶发失败（/_document ENOENT、traces 阶段 nft.json ENOENT）。

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


def is_next_nft_json_trace_flake(output: str) -> bool:
    """next build Collecting build traces 阶段偶发 route.js.nft.json ENOENT。

    源码（如 en-lesson-teacher-review/route.ts）仍在；是 .next 产物竞态，不是缺路由。
    """
    text = output or ""
    if ".nft.json" not in text:
        return False
    if "ENOENT" not in text and "no such file or directory" not in text:
        return False
    normalized = text.replace("\\", "/")
    return (
        "Collecting build traces" in text
        or ".next/server/" in normalized
        or "route.js.nft.json" in normalized
        or "page.js.nft.json" in normalized
    )


def is_next_build_cache_flake(output: str) -> bool:
    """须清 .next 重试、禁止当业务 bug 改页面的 Next 构建偶发失败。"""
    return is_next_document_collect_flake(output) or is_next_nft_json_trace_flake(
        output
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
    if is_next_build_cache_flake(output):
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
