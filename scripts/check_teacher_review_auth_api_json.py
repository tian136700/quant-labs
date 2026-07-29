#!/usr/bin/env python3
"""Regression: 登录 / 会话探测须用 readApiJson，勿 res.json()（1102 HTML 会误报「请重试」）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    auth = (ROOT / "src/components/TeacherReviewAuth.tsx").read_text(encoding="utf-8")
    provider = (ROOT / "src/contexts/EtrAuthProvider.tsx").read_text(encoding="utf-8")

    if "readApiJson" not in auth:
        fail("TeacherReviewAuth must import readApiJson")
    if "await res.json()" in auth:
        fail("TeacherReviewAuth must not use res.json() on auth response")

    if "readApiJson" not in provider:
        fail("EtrAuthProvider must import readApiJson")
    refresh = provider.split("const refresh = useCallback", 1)[1].split(
        "}, [redirectMaintenance]", 1
    )[0]
    if "await res.json()" in refresh:
        fail("EtrAuthProvider.refresh must not use res.json() on auth response")

    print("OK: teacher review auth uses readApiJson (1102-safe)")


if __name__ == "__main__":
    main()
