#!/usr/bin/env python3
"""Regression: ko-pron select/quiz pages must use dark theme surfaces, not #fff.

Fails if table wraps / search inputs go back to light-theme white backgrounds
(too bright on the site dark theme; light text on white is unreadable).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    ROOT / "src" / "components" / "KoPronSelectPage.tsx",
    ROOT / "src" / "components" / "KoPronPage.tsx",
]

# Surfaces that must not be solid white / near-white again
BANNED = re.compile(
    r"background:\s*(#fff|#ffffff|#f8fafc|#f1f5f9|#fff7ed)\b",
    re.I,
)
# CTA orange on buttons is OK; allow #fff only as button text color
ALLOWED_WHITE_TEXT = re.compile(r"color:\s*#fff\b", re.I)


def fail(msg: str) -> int:
    print(f"[check_ko_pron_dark_theme] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    for path in FILES:
        if not path.is_file():
            return fail(f"missing {path.relative_to(ROOT)}")
        text = path.read_text(encoding="utf-8")
        # Strip allowed `color: #fff` before scanning backgrounds
        scan = ALLOWED_WHITE_TEXT.sub("color: __ok__", text)
        hits = BANNED.findall(scan)
        if hits:
            return fail(
                f"{path.name} still has light surface background(s): {sorted(set(hits))}; "
                "use var(--panel) / var(--bg)"
            )
        if "var(--panel)" not in text:
            return fail(f"{path.name} must use var(--panel) for surfaces")
        if "var(--text)" not in text:
            return fail(f"{path.name} must set color: var(--text) on table/body")

    print("[check_ko_pron_dark_theme] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
