#!/usr/bin/env python3
"""清空全库 en_vocab_word.example_sentences（按 usage 重造前用）。

优先 API mode=clear_all；若未部署则 wrangler D1 remote。

用法：
  python3 scripts/en-vocab-clear-example-sentences.py --dry-run
  python3 scripts/en-vocab-clear-example-sentences.py
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from en_vocab_fill_common import call_api, load_env_file, resolve_token  # noqa: E402

DEFAULT_API_URL = (
    "https://finance.info-quests.com/api/en-vocab/fill-example-sentences"
)
DB_NAME = "strategy-compare-db"


def wrangler_clear(*, dry_run: bool) -> dict:
    count_sql = (
        "SELECT COUNT(*) AS n FROM en_vocab_word "
        "WHERE example_sentences IS NOT NULL AND TRIM(example_sentences) != '';"
    )
    count = subprocess.run(
        [
            "npx",
            "wrangler",
            "d1",
            "execute",
            DB_NAME,
            "--remote",
            "--json",
            "--command",
            count_sql,
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(count.stdout)
    n = 0
    try:
        n = int(payload[0]["results"][0]["n"])
    except Exception:
        pass
    if dry_run or n == 0:
        return {"ok": True, "mode": "clear_all_wrangler", "cleared": n, "dry_run": dry_run}
    update_sql = (
        "UPDATE en_vocab_word SET example_sentences = NULL, "
        "example_sentences_source = NULL, updated_at = datetime('now') "
        "WHERE example_sentences IS NOT NULL AND TRIM(example_sentences) != '';"
    )
    subprocess.run(
        [
            "npx",
            "wrangler",
            "d1",
            "execute",
            DB_NAME,
            "--remote",
            "--command",
            update_sql,
        ],
        cwd=ROOT,
        check=True,
    )
    return {"ok": True, "mode": "clear_all_wrangler", "cleared": n, "dry_run": False}


def main() -> int:
    cfg = load_env_file("en-vocab-fill.env")
    parser = argparse.ArgumentParser(description="Clear all en_vocab example_sentences")
    parser.add_argument(
        "--api-url",
        default=cfg.get("EN_VOCAB_FILL_EXAMPLE_SENTENCES_URL") or DEFAULT_API_URL,
    )
    parser.add_argument("--token", default=resolve_token())
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--wrangler",
        action="store_true",
        help="强制走 wrangler D1（不调 API）",
    )
    args = parser.parse_args()

    if not args.wrangler and args.token:
        try:
            result = call_api(
                args.api_url,
                args.token,
                {"mode": "clear_all", "dry_run": args.dry_run},
                user_agent="en-vocab-clear-example-sentences/1.0",
            )
            if result.get("ok") and result.get("mode") == "clear_all":
                print(json.dumps(result, ensure_ascii=False, indent=2))
                return 0
            print(
                f"[warn] API clear_all 不可用或未部署: {result!r}，改走 wrangler",
                flush=True,
            )
        except Exception as err:
            print(f"[warn] API 失败 ({err})，改走 wrangler", flush=True)

    result = wrangler_clear(dry_run=args.dry_run)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
