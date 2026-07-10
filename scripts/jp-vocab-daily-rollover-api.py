#!/usr/bin/env python3
"""北京时间跨日清理 jp-vocab 当日临时状态（释放批次、共享、协助请求等）。

与读音补全共用 JP_REVIEW_UPLOAD_TOKEN；由 jp-vocab-nightly.sh 统一调度。
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_API_URL = "https://finance.info-quests.com/api/jp-vocab/daily-rollover"
HTTP_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def load_env_file(name: str) -> dict[str, str]:
    cfg_path = Path.home() / ".config" / "info-quests" / name
    data: dict[str, str] = {}
    if not cfg_path.is_file():
        return data
    for line in cfg_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def resolve_token(review_cfg: dict[str, str]) -> str:
    return (
        os.environ.get("JP_REVIEW_UPLOAD_TOKEN")
        or review_cfg.get("JP_REVIEW_UPLOAD_TOKEN", "")
    ).strip()


def build_ssl_context() -> ssl.SSLContext | None:
    cafile = os.environ.get("SSL_CERT_FILE", "").strip()
    capath = os.environ.get("SSL_CERT_DIR", "").strip()
    if cafile or capath:
        return ssl.create_default_context(cafile=cafile or None, capath=capath or None)
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return None


_SSL_CONTEXT = build_ssl_context()


def call_api(*, api_url: str, token: str, dry_run: bool) -> dict:
    payload = {"dry_run": dry_run}
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        api_url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": HTTP_USER_AGENT,
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=120, context=_SSL_CONTEXT) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"API HTTP {err.code}: {detail}") from err


def print_result(payload: dict) -> None:
    if not payload.get("ok"):
        raise SystemExit(f"API error: {payload.get('error', payload)}")

    dry_run = bool(payload.get("dry_run"))
    print(f"[jp-vocab-daily-rollover-api] date={payload.get('date')}", flush=True)
    print(
        f"  teacher_visible_reset={payload.get('teacher_visible_reset')}",
        flush=True,
    )
    print(
        f"  display_order_refreshed={payload.get('display_order_refreshed')}",
        flush=True,
    )
    print(f"  deleted_shared={payload.get('deleted_shared')}", flush=True)
    print(
        f"  deleted_share_requests={payload.get('deleted_share_requests')}",
        flush=True,
    )
    print(
        f"  cleared_today_checks={payload.get('cleared_today_checks')}",
        flush=True,
    )
    print(
        f"[jp-vocab-daily-rollover-api] done, "
        f"{'would apply' if dry_run else 'applied'}",
        flush=True,
    )


def main() -> int:
    review_cfg = load_env_file("jp-review-sync.env")
    cfg = load_env_file("jp-vocab-fill-reading.env")
    parser = argparse.ArgumentParser(
        description="Run jp-vocab Beijing-midnight daily rollover via API."
    )
    parser.add_argument(
        "--api-url",
        default=cfg.get("JP_VOCAB_DAILY_ROLLOVER_URL", DEFAULT_API_URL),
    )
    parser.add_argument("--token", default=resolve_token(review_cfg))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.token:
        print(
            "请设置 Bearer Token（与日语教案上传共用）：\n"
            "  ~/.config/info-quests/jp-review-sync.env 中 JP_REVIEW_UPLOAD_TOKEN=...",
            file=sys.stderr,
        )
        return 1

    payload = call_api(api_url=args.api_url, token=args.token, dry_run=args.dry_run)
    print_result(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
