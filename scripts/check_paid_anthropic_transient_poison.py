#!/usr/bin/env python3
"""Regression: Anthropic 401/网关错误不得按默认 6h poison 卡死队首词。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from paid_anthropic_client import (  # noqa: E402
    TRANSIENT_ANTHROPIC_POISON_SEC,
    is_transient_anthropic_error,
    poison_seconds_for_generate_error,
)


def main() -> None:
    cases_yes = [
        'generate:Anthropic 中转 HTTP 401: {"error":{"message":"Invalid token"}}',
        "Anthropic 中转 HTTP 403: forbidden",
        "HTTP 429 rate limit",
        "HTTP 502 Bad Gateway",
        "timed out",
        "Connection reset by peer",
    ]
    cases_no = [
        "examples:invalid_format:need_four_lines",
        "empty_payload",
        "apply_none",
        "incomplete_kanji_furigana",
    ]
    for text in cases_yes:
        if not is_transient_anthropic_error(text):
            raise SystemExit(f"FAIL: expected transient: {text!r}")
        sec = poison_seconds_for_generate_error(text, default_sec=6 * 3600)
        if sec > TRANSIENT_ANTHROPIC_POISON_SEC + 5:
            raise SystemExit(f"FAIL: transient poison too long ({sec}s): {text!r}")
    for text in cases_no:
        if is_transient_anthropic_error(text):
            raise SystemExit(f"FAIL: should NOT be transient: {text!r}")
        sec = poison_seconds_for_generate_error(text, default_sec=6 * 3600)
        if sec < 6 * 3600:
            raise SystemExit(f"FAIL: content error should keep long poison: {text!r}")

    jp = (ROOT / "scripts/jp-vocab-fill-online-batch-api.py").read_text(encoding="utf-8")
    en = (ROOT / "scripts/en-vocab-fill-online-batch-api.py").read_text(encoding="utf-8")
    for label, src in (("jp", jp), ("en", en)):
        if "poison_seconds_for_generate_error" not in src:
            raise SystemExit(f"FAIL: {label} online-batch must use poison_seconds_for_generate_error")
        if "mark_poison" not in src:
            raise SystemExit(f"FAIL: {label} missing mark_poison")

    print("[check_paid_anthropic_transient_poison] OK")


if __name__ == "__main__":
    main()
