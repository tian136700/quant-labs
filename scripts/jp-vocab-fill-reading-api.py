#!/usr/bin/env python3
"""通过线上 API 补全 jp_vocab_word 缺失读音（Mac nightly / 手动均可）。"""

from __future__ import annotations

import argparse
import json
import os
import sys
import ssl
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-reading"
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


def load_config() -> dict[str, str]:
    return load_env_file("jp-vocab-fill-reading.env")


def resolve_token(review_cfg: dict[str, str]) -> str:
    """与 jp-review-sync.py 共用 ~/.config/info-quests/jp-review-sync.env 里的 Token。"""
    return (
        os.environ.get("JP_REVIEW_UPLOAD_TOKEN")
        or review_cfg.get("JP_REVIEW_UPLOAD_TOKEN", "")
    ).strip()


def build_ssl_context() -> ssl.SSLContext | None:
    """
    Python on macOS (especially python.org builds) can occasionally miss system root CAs.
    Prefer certifi's CA bundle if available; otherwise fall back to default behavior.
    """
    cafile = os.environ.get("SSL_CERT_FILE", "").strip()
    capath = os.environ.get("SSL_CERT_DIR", "").strip()
    if cafile or capath:
        return ssl.create_default_context(cafile=cafile or None, capath=capath or None)

    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return None


def call_api(
    *,
    api_url: str,
    token: str,
    dry_run: bool,
    use_jisho: bool,
    jisho_delay_ms: int,
    updates: list[dict] | None,
) -> dict:
    payload: dict = {
        "dry_run": dry_run,
        "use_jisho": use_jisho,
        "jisho_delay_ms": jisho_delay_ms,
    }
    if updates:
        payload["updates"] = updates

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
        context = build_ssl_context()
        with urllib.request.urlopen(request, timeout=300, context=context) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"API HTTP {err.code}: {detail}") from err


def print_result(payload: dict) -> None:
    if not payload.get("ok"):
        raise SystemExit(f"API error: {payload.get('error', payload)}")

    mode = payload.get("mode", "auto")
    print(f"[jp-vocab-fill-reading-api] mode={mode}", flush=True)

    for item in payload.get("applied") or []:
        print(
            f"  {item.get('id')} {item.get('word')!r} -> {item.get('reading')!r}",
            flush=True,
        )

    skipped_long = payload.get("skipped_long") or []
    if skipped_long:
        parts = [f"{x.get('id')}:{x.get('word')!r}" for x in skipped_long]
        print(f"  长句/短语跳过: {', '.join(parts)}", flush=True)

    skipped = payload.get("skipped") or []
    if skipped:
        parts = [f"{x.get('id')}:{x.get('word')!r}" for x in skipped]
        print(f"  无法推断/未更新: {', '.join(parts)}", flush=True)

    jisho_errors = int(payload.get("jisho_errors") or 0)
    if jisho_errors:
        print(f"  jisho 网络失败: {jisho_errors} 次", flush=True)

    updated = int(payload.get("updated") or 0)
    dry_run = bool(payload.get("dry_run"))
    print(
        f"[jp-vocab-fill-reading-api] done, "
        f"{'would update' if dry_run else 'updated'}: {updated}",
        flush=True,
    )


def main() -> int:
    review_cfg = load_env_file("jp-review-sync.env")
    cfg = load_config()
    parser = argparse.ArgumentParser(description="Fill jp_vocab reading via Cloudflare API.")
    parser.add_argument(
        "--api-url",
        default=cfg.get("JP_VOCAB_FILL_READING_URL", DEFAULT_API_URL),
    )
    parser.add_argument(
        "--token",
        default=resolve_token(review_cfg),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-jisho", action="store_true")
    parser.add_argument(
        "--jisho-delay-ms",
        type=int,
        default=int(cfg.get("JP_VOCAB_FILL_READING_JISHO_DELAY_MS", "350") or 350),
    )
    parser.add_argument(
        "--allow-skipped",
        action="store_true",
        help="仍有无法推断的词条时也返回 0（适合 nightly 定时任务）",
    )
    parser.add_argument(
        "--update",
        action="append",
        metavar="WORD_ID:READING",
        help="手动指定读音，可重复；指定后仅提交这些更新",
    )
    args = parser.parse_args()

    if not args.token:
        print(
            "请设置 Bearer Token（与日语教案上传共用）：\n"
            "  1) ~/.config/info-quests/jp-review-sync.env 中 JP_REVIEW_UPLOAD_TOKEN=...\n"
            "  2) 或环境变量 JP_REVIEW_UPLOAD_TOKEN",
            file=sys.stderr,
        )
        return 1

    updates: list[dict] | None = None
    if args.update:
        updates = []
        for raw in args.update:
            if ":" not in raw:
                print(f"无效 --update 格式（应为 id:reading）: {raw!r}", file=sys.stderr)
                return 1
            word_id_raw, reading = raw.split(":", 1)
            try:
                word_id = int(word_id_raw.strip())
            except ValueError:
                print(f"无效 word_id: {word_id_raw!r}", file=sys.stderr)
                return 1
            if word_id <= 0 or not reading.strip():
                print(f"无效 --update: {raw!r}", file=sys.stderr)
                return 1
            updates.append({"word_id": word_id, "reading": reading.strip()})

    payload = call_api(
        api_url=args.api_url,
        token=args.token,
        dry_run=args.dry_run,
        use_jisho=not args.no_jisho,
        jisho_delay_ms=max(0, args.jisho_delay_ms),
        updates=updates,
    )
    print_result(payload)

    jisho_errors = int(payload.get("jisho_errors") or 0)
    skipped = payload.get("skipped") or []
    if jisho_errors and not args.allow_skipped:
        return 1
    if skipped and not args.allow_skipped:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
