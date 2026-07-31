#!/usr/bin/env python3
"""Fail if block-comment body lines contain `*/` (closes the comment early).

Classic footgun: JSDoc like `* （API /api/*/shared 仍计数。）` — the `*/`
in the path ends the comment; following backticks then look like a template
literal → SWC "Unterminated template" and deploy fails.

Also catches same-line openers that embed `*/` before the intended closer.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

# Continuation / body of /* … */ (not the closing `*/` line alone)
BODY_LINE = re.compile(r"^(\s*)\*(?!/)")
# Opening that still has more intended comment after an embedded */
OPEN_WITH_EMBEDDED = re.compile(r"/\*[^*]*\*/.")


def check_file(path: Path) -> list[str]:
    errs: list[str] = []
    text = path.read_text(encoding="utf-8")
    rel = path.relative_to(ROOT)
    for i, line in enumerate(text.splitlines(), 1):
        if BODY_LINE.match(line) and "*/" in line:
            errs.append(
                f"{rel}:{i}: block-comment body must not contain '*/' "
                "(closes comment early; write 'star-slash paths' in prose, "
                "e.g. 'API shared 列表' not '/api/*/shared')"
            )
        if OPEN_WITH_EMBEDDED.search(line) and not line.strip().endswith("*/"):
            # rare: /* ... /api/*/foo ... */ on one line — first */ already closed
            if line.count("*/") >= 1 and "/*" in line:
                # only flag if there is content after first */
                m = re.search(r"/\*.*?\*/(.+)", line)
                if m and m.group(1).strip() and "*/" in m.group(1):
                    errs.append(
                        f"{rel}:{i}: block comment embeds '*/' before intended end"
                    )
    return errs


def main() -> int:
    errs: list[str] = []
    for path in sorted(SRC.rglob("*")):
        if path.suffix not in {".ts", ".tsx", ".js", ".jsx"}:
            continue
        errs.extend(check_file(path))
    if errs:
        print("check_block_comment_star_slash: FAIL")
        for e in errs:
            print(f"  {e}")
        return 1
    print("check_block_comment_star_slash: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
