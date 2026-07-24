#!/usr/bin/env python3
"""Regression: extracted *Styles*.tsx must use <style jsx global>.

Scoped <style jsx> only styles elements in that component's tree. Extracted
Styles components usually render only a <style> tag while classNames live in
parent/sibling files — scoped styles then apply to nothing (unstyled page).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

# Match <style jsx> that is NOT already <style jsx global>
SCOPED_JSX = re.compile(r"<style\s+jsx(?!\s+global)\b", re.I)


def main() -> int:
    errs: list[str] = []
    for path in sorted(SRC.rglob("*Styles*.tsx")):
        text = path.read_text(encoding="utf-8")
        if SCOPED_JSX.search(text):
            errs.append(
                f"{path.relative_to(ROOT)}: use <style jsx global> "
                "(extracted Styles cannot use scoped jsx)"
            )
    if errs:
        print("check_styled_jsx_styles_global FAILED:")
        for e in errs:
            print(f"  - {e}")
        return 1
    print("check_styled_jsx_styles_global OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
