#!/usr/bin/env python3
"""Fail if CSS under src/ has unclosed /* */ comments (breaks next build).

Regression for mobile.css barrel split that left a lone `/**` and blocked deploy.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


def comment_balance(text: str) -> int:
    """Return 0 if balanced; 1 if an unclosed /* remains.

    CSS comments do not nest: once inside /* … */, only look for */.
    (Naive nesting wrongly treats path text like mobile/*.css as a new open.)
    """
    in_comment = False
    i = 0
    n = len(text)
    while i < n:
        if in_comment:
            if text.startswith("*/", i):
                in_comment = False
                i += 2
                continue
            i += 1
            continue
        if text.startswith("/*", i):
            in_comment = True
            i += 2
            continue
        i += 1
    return 1 if in_comment else 0


def main() -> int:
    errs: list[str] = []
    for path in sorted(SRC.rglob("*.css")):
        text = path.read_text(encoding="utf-8")
        depth = comment_balance(text)
        if depth != 0:
            rel = path.relative_to(ROOT).as_posix()
            errs.append(f"{rel}: unclosed CSS comment (/* without matching */)")
        # Barrel files: every @import path must exist
        if path.name in {"mobile.css", "globals.css"} or path.name.endswith("-barrel.css"):
            parent = path.parent
            for line in text.splitlines():
                s = line.strip()
                if not s.startswith("@import"):
                    continue
                # @import "./mobile/foo.css"; or url(...)
                q = None
                for ch in ('"', "'"):
                    if ch in s:
                        q = ch
                        break
                if not q:
                    continue
                start = s.find(q) + 1
                end = s.find(q, start)
                if end <= start:
                    continue
                target = (parent / s[start:end]).resolve()
                if not target.is_file():
                    rel = path.relative_to(ROOT).as_posix()
                    errs.append(f"{rel}: missing @import target {s[start:end]}")

    if errs:
        print("check_css_comment_balance: FAIL", file=sys.stderr)
        for e in errs:
            print(f"  {e}", file=sys.stderr)
        return 1
    print("check_css_comment_balance: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
