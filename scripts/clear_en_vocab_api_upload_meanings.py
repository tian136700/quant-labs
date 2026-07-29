#!/usr/bin/env python3
"""清空 upload_source=api 词条的释义（STT 侧 ECDICT 释义不准，留给 fill-meaning）。"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_URL = "https://english.info-quests.com/api/en-vocab/local-upload"


def main() -> int:
    url = (os.getenv("EN_VOCAB_LOCAL_UPLOAD_API_URL") or DEFAULT_URL).strip()
    token = (os.getenv("JP_REVIEW_UPLOAD_TOKEN") or "").strip()
    if not token:
        print("FAIL: 未设置 JP_REVIEW_UPLOAD_TOKEN", file=sys.stderr)
        return 1

    payload = json.dumps({"mode": "clear_api_meanings"}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        print(f"FAIL: HTTP {exc.code}: {raw[:500]}", file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1

    if not body.get("ok"):
        print(f"FAIL: {body.get('error') or body}", file=sys.stderr)
        return 1

    cleared = int(body.get("cleared") or 0)
    print(body.get("message") or f"cleared={cleared}")
    print(f"OK: cleared {cleared} api-upload meanings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
