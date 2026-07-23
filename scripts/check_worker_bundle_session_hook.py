#!/usr/bin/env python3
"""Regression: sessionStart hook must warn about Worker gzip 2980 soft limit.

The soft gate has failed deploys many times; agents must see it before coding.
Hook path is local (.cursor/ is gitignored) but must stay present on this Mac.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOOK = ROOT / ".cursor" / "hooks" / "bug-prevention-session.py"

REQUIRED = (
    "[worker-bundle-size]",
    "2980",
    "check_worker_bundle_size",
    "await import",
    "ssr: false",
)


def main() -> int:
    if not HOOK.is_file():
        print(
            f"check_worker_bundle_session_hook: FAIL — missing {HOOK}",
            file=sys.stderr,
        )
        return 1
    text = HOOK.read_text(encoding="utf-8")
    missing = [s for s in REQUIRED if s not in text]
    if missing:
        print(
            "check_worker_bundle_session_hook: FAIL — "
            f"{HOOK.relative_to(ROOT)} missing: {', '.join(missing)}",
            file=sys.stderr,
        )
        return 1
    print("check_worker_bundle_session_hook: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
