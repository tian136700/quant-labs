#!/usr/bin/env python3
"""Regression: finance ComparePageGate must not bake Checking… into force-static HTML."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "src/components/ComparePageGate.tsx"


def main() -> int:
    text = GATE.read_text(encoding="utf-8")
    errors: list[str] = []

    # Strip comments so docs may mention the forbidden strings.
    without_comments = re.sub(r"//.*?$", "", text, flags=re.M)
    without_comments = re.sub(r"/\*.*?\*/", "", without_comments, flags=re.S)

    if re.search(r"Checking…|验证中", without_comments):
        errors.append(
            "ComparePageGate must not render Checking…/验证中 "
            "(force-static bakes it into HTML; iPad stays on spinner if JS is slow)."
        )

    if re.search(r"\bchecking\b", without_comments):
        errors.append(
            "Do not branch UI on `checking` in ComparePageGate; "
            "show login / maintenance / compare by user+isAdmin only."
        )

    if "force-static" not in (ROOT / "src/app/page.tsx").read_text(encoding="utf-8"):
        # Soft note only if homepage no longer force-static — still keep gate clean
        pass

    if errors:
        print("FAIL: check_compare_page_gate_no_checking.py")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("OK: ComparePageGate has no Checking… / checking UI branch")
    return 0


if __name__ == "__main__":
    sys.exit(main())
