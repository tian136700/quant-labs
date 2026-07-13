#!/usr/bin/env python3
"""通过线上 API 用内置 N5 例句词表补全 jp_vocab_word.example_sentences。"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-example-sentences"


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
        data[key.strip()] = value.strip()
    return data


def load_token() -> str:
    token = os.environ.get("JP_REVIEW_UPLOAD_TOKEN", "").strip()
    if token:
        return token
    return load_env_file("jp-review-sync.env").get("JP_REVIEW_UPLOAD_TOKEN", "").strip()


def load_api_url() -> str:
    return (
        os.environ.get("JP_VOCAB_FILL_EXAMPLE_SENTENCES_URL", "").strip()
        or DEFAULT_API_URL
    )


def call_api(*, api_url: str, token: str, dry_run: bool, from_catalog: bool) -> dict:
    payload = {"dry_run": dry_run, "from_catalog": from_catalog}
    req = urllib.request.Request(
        api_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {err.code}: {body}") from err


def main() -> int:
    parser = argparse.ArgumentParser(description="补全日语单词例句（内置 N5 词表）")
    parser.add_argument("--dry-run", action="store_true", help="只预览，不写库")
    parser.add_argument("--scan", action="store_true", help="仅扫描缺失例句")
    parser.add_argument("--api-url", default=load_api_url())
    args = parser.parse_args()

    token = load_token()
    if not token:
        print("缺少 JP_REVIEW_UPLOAD_TOKEN", file=sys.stderr)
        return 1

    result = call_api(
        api_url=args.api_url,
        token=token,
        dry_run=args.dry_run,
        from_catalog=not args.scan,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
