#!/usr/bin/env python3
"""Regression: /en-vocab requires login; list/sync APIs require requireEnVocabRead."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    page = (ROOT / "src/components/EnVocabPage.tsx").read_text(encoding="utf-8")
    route = (ROOT / "src/app/api/en-vocab/route.ts").read_text(encoding="utf-8")
    sync = (ROOT / "src/app/api/en-vocab/sync/route.ts").read_text(encoding="utf-8")

    sync_hook = (ROOT / "src/hooks/useEnVocabPageSync.ts").read_text(encoding="utf-8")

    if "TeacherReviewAuth" not in page:
        fail("EnVocabPage must use TeacherReviewAuth for unauthenticated visitors")
    if "if (!user)" not in page:
        fail("EnVocabPage must early-return when !user")
    if "useEnVocabPageSync" not in page:
        fail("EnVocabPage must use useEnVocabPageSync")
    if "if (checking || !user) return;" not in sync_hook:
        fail("useEnVocabPageSync must not load until logged in")

    if "requireEnVocabRead" not in route:
        fail("GET /api/en-vocab must use requireEnVocabRead")
    get_idx = route.find("export async function GET")
    post_idx = route.find("export async function POST")
    if get_idx < 0:
        fail("missing GET handler")
    get_chunk = route[get_idx : post_idx if post_idx > get_idx else get_idx + 1200]
    if "requireEnVocabRead" not in get_chunk:
        fail("GET /api/en-vocab body must call requireEnVocabRead")
    if "if (!allowed)" not in get_chunk:
        fail("GET /api/en-vocab must 401 when !allowed")

    if "requireEnVocabRead" not in sync:
        fail("GET /api/en-vocab/sync must use requireEnVocabRead")

    print("OK: en-vocab login-required (page + list/sync API)")


if __name__ == "__main__":
    main()
