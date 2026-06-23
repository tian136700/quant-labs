#!/usr/bin/env python3
"""手动发布 AI Trend Digest 博客文章到 /api/trend-blog/publish。

认证：Bearer ``JP_REVIEW_UPLOAD_TOKEN``（与日语复习 / trends ingest 共用）。
本地无 token 时，127.0.0.1 / localhost 可免认证。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
from trend_blog_markdown import parse_trend_blog_markdown
DEFAULT_PUBLISH_URL = os.getenv(
    "TREND_BLOG_PUBLISH_URL",
    "http://127.0.0.1:3002/api/trend-blog/publish",
)


def load_dotenv_local() -> dict[str, str]:
    data: dict[str, str] = {}
    env_path = ROOT / ".env.local"
    if not env_path.is_file():
        return data
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def upload_token() -> str:
    return (
        os.getenv("TREND_BLOG_UPLOAD_TOKEN")
        or os.getenv("JP_REVIEW_UPLOAD_TOKEN")
        or load_dotenv_local().get("JP_REVIEW_UPLOAD_TOKEN")
        or ""
    ).strip()


def build_payload(args: argparse.Namespace) -> dict:
    if args.payload:
        data = json.loads(args.payload.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise SystemExit("payload JSON must be an object")
        return data

    headline = (args.headline or "").strip()
    meta_description = (args.meta_description or "").strip()
    content_html = ""

    if args.content_markdown:
        parsed = parse_trend_blog_markdown(
            args.content_markdown.read_text(encoding="utf-8")
        )
        content_html = parsed["content_html"]
        if not headline:
            headline = parsed["headline"]
        if not meta_description:
            meta_description = parsed["meta_description"]
    elif args.content_file:
        content_html = args.content_file.read_text(encoding="utf-8").strip()
    elif args.content_html:
        content_html = args.content_html.strip()

    if not content_html:
        raise SystemExit(
            "Provide --content-markdown, --content-file, or --content-html"
        )
    if not headline:
        raise SystemExit(
            "--headline is required unless --content-markdown provides an H1"
        )

    tags: list[str] | None = None
    if args.tags:
        tags = [t.strip() for t in args.tags.split(",") if t.strip()]

    payload: dict = {
        "locale": args.locale,
        "slug": args.slug,
        "title": args.title,
        "headline": headline,
        "meta_description": meta_description,
        "author": args.author,
        "published_at": args.published_at,
        "content_html": content_html,
    }
    if args.read_minutes is not None:
        payload["read_minutes"] = args.read_minutes
    if tags:
        payload["tags"] = tags
    return payload


def publish(payload: dict, *, url: str, token: str) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "trend-blog-publish/1.0",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if not isinstance(data, dict):
                raise RuntimeError("publish 响应非 JSON 对象")
            return data
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:800]
        raise RuntimeError(f"publish HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"publish 网络错误: {exc}") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish AI Trend Digest blog post")
    parser.add_argument("--url", default=DEFAULT_PUBLISH_URL, help="Publish API URL")
    parser.add_argument("--payload", type=Path, help="JSON payload file")
    parser.add_argument("--locale", choices=("en", "zh"), default="en")
    parser.add_argument("--slug", default="featured")
    parser.add_argument("--title", default="AI Trend Digest — Tech Blog")
    parser.add_argument("--headline", required=False, help="Article H1 headline")
    parser.add_argument(
        "--content-markdown",
        type=Path,
        help="Markdown article (extracts <!-- meta -->, # title, body HTML)",
    )
    parser.add_argument("--meta-description", dest="meta_description", default="")
    parser.add_argument("--author", default="Alex Chen")
    parser.add_argument("--published-at", dest="published_at", default="")
    parser.add_argument("--read-minutes", dest="read_minutes", type=int, default=8)
    parser.add_argument("--tags", help="Comma-separated tags")
    parser.add_argument("--content-file", type=Path, help="HTML fragment for #content-area")
    parser.add_argument("--content-html", help="Inline HTML fragment")
    args = parser.parse_args()

    if (
        not args.payload
        and not args.headline
        and not args.content_markdown
    ):
        parser.error(
            "--headline or --content-markdown is required unless --payload is used"
        )

    payload = build_payload(args)
    token = upload_token()
    result = publish(payload, url=args.url.strip(), token=token)

    if not result.get("ok"):
        print(json.dumps(result, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    public_url = result.get("public_url")
    if public_url:
        print(f"\nOpen: http://127.0.0.1:3002{public_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
