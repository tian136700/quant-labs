#!/usr/bin/env python3
"""回归：fill-* Worker 限流须含跨路径全局桶（防多阶段并行打满 → shared 1102）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []
    text = (ROOT / "src/lib/worker-api-rate-limit.ts").read_text(encoding="utf-8")

    if "VOCAB_FILL_API_GLOBAL_MIN_INTERVAL_MS" not in text:
        errors.append("missing VOCAB_FILL_API_GLOBAL_MIN_INTERVAL_MS")
    if "VOCAB_FILL_API_GLOBAL_ROUTE_KEY" not in text:
        errors.append("missing VOCAB_FILL_API_GLOBAL_ROUTE_KEY")

    fn = text.split("export async function enforceVocabFillRouteRateLimit", 1)
    if len(fn) < 2:
        errors.append("enforceVocabFillRouteRateLimit missing")
    else:
        body = fn[1].split("\nexport ", 1)[0]
        if "VOCAB_FILL_API_GLOBAL_ROUTE_KEY" not in body:
            errors.append(
                "enforceVocabFillRouteRateLimit must check global fill bucket"
            )
        if "VOCAB_FILL_API_MIN_INTERVAL_MS" not in body:
            errors.append(
                "enforceVocabFillRouteRateLimit must still check per-route interval"
            )

    helper = (ROOT / "src/lib/vocab-study-shared-fetch.ts").read_text(
        encoding="utf-8"
    )
    if "fetchVocabStudySharedWithRetry" not in helper:
        errors.append("vocab-study-shared-fetch helper missing")
    if "VOCAB_STUDY_SHARED_FETCH_TIMEOUT_MS" not in helper:
        errors.append("shared fetch timeout constant missing")

    if errors:
        print("check_vocab_fill_global_rate_limit FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_vocab_fill_global_rate_limit OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
