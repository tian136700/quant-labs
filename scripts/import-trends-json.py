#!/usr/bin/env python3
"""Import existing raw_trends.json into D1 via /api/trends/ingest."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGG = ROOT / "trend_aggregator"
sys.path.insert(0, str(AGG))

from pipeline import load_json_file  # noqa: E402
from sync_api import build_ingest_payload, sync_to_api  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Import raw_trends.json to D1")
    parser.add_argument(
        "--json",
        type=Path,
        default=AGG / "output" / "raw_trends.json",
        help="Path to raw_trends.json",
    )
    parser.add_argument(
        "--url",
        default=None,
        help="Ingest API URL (default: TREND_INGEST_URL or localhost:3002)",
    )
    args = parser.parse_args()

    if not args.json.is_file():
        print(f"File not found: {args.json}", file=sys.stderr)
        return 2

    data = load_json_file(args.json)
    raw = data.get("raw") or {}
    processed = data.get("processed") or {}
    if not processed:
        from pipeline import clean_and_deduplicate

        processed = clean_and_deduplicate(raw)

    payload = build_ingest_payload(
        raw,
        processed,
        fetched_at=str(data.get("fetched_at") or ""),
    )
    result = sync_to_api(payload, ingest_url=args.url)
    if not result.get("ok"):
        print(f"Failed: {result}", file=sys.stderr)
        return 1
    print(
        f"OK run_id={result.get('run_id')} items={result.get('item_count')} "
        f"selected={result.get('selected_count')}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
