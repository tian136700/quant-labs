#!/usr/bin/env python3
"""Regression: Anthropic 401/网关错误不得按默认 6h poison 卡死队首词。

另：503「No available accounts」须在 call_anthropic 内短退避重试，
不能一撞中转账号池空就立刻 generate 失败 + poison。
"""

from __future__ import annotations

import inspect
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from paid_anthropic_client import (  # noqa: E402
    TRANSIENT_ANTHROPIC_HTTP_RETRY_MAX,
    TRANSIENT_ANTHROPIC_POISON_SEC,
    _is_retryable_anthropic_http,
    call_anthropic,
    is_transient_anthropic_error,
    poison_seconds_for_generate_error,
)


def main() -> None:
    cases_yes = [
        'generate:Anthropic 中转 HTTP 401: {"error":{"message":"Invalid token"}}',
        "Anthropic 中转 HTTP 403: forbidden",
        "HTTP 429 rate limit",
        "HTTP 502 Bad Gateway",
        "HTTP 503",
        (
            'generate:Anthropic 中转 HTTP 503: {"error":{"type":"<nil>",'
            '"message":"No available accounts: no available accounts '
            '(request id: 202608091500189427982578268d9d6f4uNcTFr)"},'
            '"type":"error"}'
        ),
        "timed out",
        "Connection reset by peer",
        "no available accounts",
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

    if TRANSIENT_ANTHROPIC_HTTP_RETRY_MAX < 2:
        raise SystemExit("FAIL: HTTP retry max must be >= 2")
    if not _is_retryable_anthropic_http(
        503, '{"message":"No available accounts: no available accounts"}'
    ):
        raise SystemExit("FAIL: 503 no available accounts must be retryable")
    if not _is_retryable_anthropic_http(429, "rate limit"):
        raise SystemExit("FAIL: 429 must be retryable")
    if _is_retryable_anthropic_http(400, "bad request"):
        raise SystemExit("FAIL: 400 must NOT be retryable")

    src = inspect.getsource(call_anthropic)
    if "time.sleep" not in src or "_is_retryable_anthropic_http" not in src:
        raise SystemExit(
            "FAIL: call_anthropic must retry retryable HTTP with sleep"
        )

    jp_batch = (ROOT / "scripts/jp-vocab-fill-online-batch-api.py").read_text(
        encoding="utf-8"
    )
    jp_runtime = (
        ROOT / "scripts/lib/jp_vocab_online_batch_runtime.py"
    ).read_text(encoding="utf-8")
    en = (ROOT / "scripts/en-vocab-fill-online-batch-api.py").read_text(
        encoding="utf-8"
    )
    if "mark_poison" not in jp_batch:
        raise SystemExit("FAIL: jp online-batch missing mark_poison")
    if "poison_seconds_for_generate_error" not in jp_runtime:
        raise SystemExit(
            "FAIL: jp online-batch runtime must use "
            "poison_seconds_for_generate_error"
        )
    if "poison_seconds_for_generate_error" not in en or "mark_poison" not in en:
        raise SystemExit(
            "FAIL: en online-batch must use poison_seconds_for_generate_error "
            "+ mark_poison"
        )

    print("[check_paid_anthropic_transient_poison] OK")


if __name__ == "__main__":
    main()
