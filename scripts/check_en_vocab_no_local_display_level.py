#!/usr/bin/env python3
"""Regression: do not redefine effectiveEnVocabDisplayLevel outside en-vocab-review."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "src/lib/en-vocab-review.ts"
SCAN_DIRS = (
    ROOT / "src/components",
    ROOT / "src/app",
)
LOCAL_DEF_RE = re.compile(
    r"^\s*(?:export\s+)?function\s+effectiveEnVocabDisplayLevel\s*\(",
    re.MULTILINE,
)


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not CANONICAL.is_file():
        fail(f"missing canonical export file: {CANONICAL.relative_to(ROOT)}")
    canon = CANONICAL.read_text(encoding="utf-8")
    if "export function effectiveEnVocabDisplayLevel" not in canon:
        fail("en-vocab-review.ts must export effectiveEnVocabDisplayLevel")

    offenders: list[str] = []
    for base in SCAN_DIRS:
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if path.suffix not in {".ts", ".tsx"}:
                continue
            text = path.read_text(encoding="utf-8")
            if LOCAL_DEF_RE.search(text):
                offenders.append(str(path.relative_to(ROOT)))

    if offenders:
        fail(
            "redefine effectiveEnVocabDisplayLevel only in src/lib/en-vocab-review.ts; "
            f"found local defs in: {', '.join(offenders)}"
        )

    print("OK: effectiveEnVocabDisplayLevel only in en-vocab-review.ts")


if __name__ == "__main__":
    main()
