#!/usr/bin/env python3
"""例句补全：拉取缺例句 → 本地模型生成 → 按格式写回（可复制到其它项目定时跑）。

线上接口：POST /api/jp-vocab/fill-example-sentences
鉴权：Authorization: Bearer $JP_REVIEW_UPLOAD_TOKEN
（与 jp-review-sync 共用 ~/.config/info-quests/jp-review-sync.env）

示例：
  # 1) 拉缺例句（含 prompt / upload_spec）
  python3 scripts/jp-vocab-fill-example-sentences-api.py --list-missing --limit 15

  # 2) 按 upload_spec 生成后写回
  python3 scripts/jp-vocab-fill-example-sentences-api.py --apply updates.json
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

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))
from worker_api_guard import skip_if_worker_unavailable  # noqa: E402

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
        data[key.strip()] = value.strip().strip('"').strip("'")
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


def call_api(*, api_url: str, token: str, payload: dict, timeout: int = 180) -> dict:
    req = urllib.request.Request(
        api_url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "jp-vocab-fill-example-sentences-api/2.0",
        },
        method="POST",
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {err.code}: {body}") from err


def main() -> int:
    parser = argparse.ArgumentParser(
        description="例句 list_missing / apply（格式由线上 upload_spec 强制校验）"
    )
    parser.add_argument("--list-missing", action="store_true", help="拉取缺例句词条")
    parser.add_argument("--limit", type=int, default=15, help="list_missing 条数上限")
    parser.add_argument(
        "--kind",
        choices=["word", "grammar"],
        help="只拉单词或语法",
    )
    parser.add_argument(
        "--apply",
        metavar="JSON",
        help='写回文件，形如 [{"word_id":1,"example_sentences":"..."}] 或 {"updates":[...]}',
    )
    parser.add_argument("--dry-run", action="store_true", help="apply 时只校验不写库")
    parser.add_argument(
        "--catalog",
        action="store_true",
        help="用内置 N5 词表填空（不经本地模型）",
    )
    parser.add_argument("--api-url", default=load_api_url())
    args = parser.parse_args()

    token = load_token()
    if not token:
        print("缺少 JP_REVIEW_UPLOAD_TOKEN", file=sys.stderr)
        return 1

    if skip_if_worker_unavailable(args.api_url, label="jp-vocab-fill-examples"):
        return 0

    if args.apply:
        raw = json.loads(Path(args.apply).read_text(encoding="utf-8"))
        updates = raw.get("updates") if isinstance(raw, dict) else raw
        if not isinstance(updates, list):
            print("apply JSON 须为 list 或 {updates:[...]}", file=sys.stderr)
            return 1
        payload = {
            "mode": "apply",
            "updates": updates,
            "dry_run": args.dry_run,
        }
    elif args.catalog:
        payload = {"mode": "catalog", "dry_run": args.dry_run}
    else:
        # 默认 list_missing
        payload = {
            "mode": "list_missing",
            "limit": max(1, args.limit),
        }
        if args.kind:
            payload["kind"] = args.kind

    result = call_api(api_url=args.api_url, token=token, payload=payload)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
