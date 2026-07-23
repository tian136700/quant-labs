#!/usr/bin/env python3
"""Regression: Mac trackpad vertical scroll must not be trapped.

Fails if:
1) Any TSX still does prev/restore on document.body.style.overflow (use lockBodyScroll).
2) Table-wrap style rules set overflow-x: auto|scroll without overflow-y: clip nearby.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

BODY_PREV = re.compile(
    r"const\s+prev\s*=\s*document\.body\.style\.overflow",
)
BODY_ASSIGN = re.compile(
    r"document\.body\.style\.overflow\s*=\s*[\"']hidden[\"']",
)

# CSS / styled-jsx rule that looks like a horizontal scrollport for tables/lists
TABLE_WRAP_HINT = re.compile(
    r"(table-wrap|admin-table|rbac-.*wrap|duration-totals|"
    r"calendar:has|coach-table|review-table|select-table|"
    r"risk-chart-panel|jpls-duration)",
    re.I,
)
OVERFLOW_X = re.compile(r"overflow-x\s*:\s*(auto|scroll)\s*;")
OVERFLOW_Y_CLIP = re.compile(r"overflow-y\s*:\s*clip\s*;")


def check_body_locks() -> list[str]:
    errs: list[str] = []
    for path in SRC.rglob("*.tsx"):
        text = path.read_text(encoding="utf-8")
        if BODY_PREV.search(text) or BODY_ASSIGN.search(text):
            errs.append(
                f"{path.relative_to(ROOT)}: use lockBodyScroll(), "
                "do not prev/restore document.body.style.overflow"
            )
    return errs


def _rule_blocks(text: str) -> list[str]:
    """Split roughly on CSS rules `{ ... }` (non-nested enough for our styles)."""
    blocks: list[str] = []
    i = 0
    while True:
        start = text.find("{", i)
        if start < 0:
            break
        depth = 0
        j = start
        while j < len(text):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    # include preceding selector snippet
                    sel_start = text.rfind("}", i, start)
                    sel_start = 0 if sel_start < 0 else sel_start + 1
                    blocks.append(text[sel_start : j + 1])
                    i = j + 1
                    break
            j += 1
        else:
            break
    return blocks


def check_overflow_x_clips() -> list[str]:
    errs: list[str] = []
    paths = list((SRC / "app").glob("*.css")) + list(SRC.rglob("*.tsx"))
    for path in paths:
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(ROOT)
        for block in _rule_blocks(text):
            if not OVERFLOW_X.search(block):
                continue
            # Only enforce on likely page scroll traps (tables / wide wraps)
            head = block.split("{", 1)[0]
            body = block
            if not (
                TABLE_WRAP_HINT.search(head)
                or TABLE_WRAP_HINT.search(body[:120])
                or "jp-vocab-table-wrap" in head
                or "etr-table-wrap" in head
                or "admin-table-wrap" in head
                or "table-wrap" in head
            ):
                continue
            if OVERFLOW_Y_CLIP.search(block):
                continue
            # Skip pure code/pre blocks
            if re.search(r"\b(pre|code|code-block)\b", head, re.I):
                continue
            snippet = " ".join(head.strip().split())[:80]
            errs.append(
                f"{rel}: overflow-x:auto/scroll without overflow-y:clip "
                f"near `{snippet}`"
            )
    return errs


def main() -> int:
    errs = check_body_locks() + check_overflow_x_clips()
    if errs:
        print("trackpad scroll guards FAILED:")
        for e in errs:
            print(f"  - {e}")
        return 1
    print("trackpad scroll guards OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
