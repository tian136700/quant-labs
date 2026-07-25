#!/usr/bin/env python3
"""Guard: grammar PDF section peaks require dense left badge runs (lesson-68)."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    ROOT / "src/lib/jp-vocab-ref-pdf-export.ts",
    ROOT / "src/lib/en-vocab-ref-pdf-export.ts",
]


def check(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []
    if "function detectGrammarSectionPeaks" not in text:
        errors.append(f"{path.name}: missing detectGrammarSectionPeaks")
        return errors
    # Extract function body roughly
    m = re.search(
        r"function detectGrammarSectionPeaks\([\s\S]*?\n\}\n\n",
        text,
    )
    body = m.group(0) if m else text
    if "minAvgBadgeFrac" not in body:
        errors.append(f"{path.name}: detectGrammarSectionPeaks must use minAvgBadgeFrac")
    if not re.search(r"minAvgBadgeFrac\s*=\s*0\.25", body):
        errors.append(f"{path.name}: minAvgBadgeFrac must be 0.25 (lesson-68 manga false peak ~0.19)")
    if "peakAvgs" not in body:
        errors.append(f"{path.name}: should keep denser run within minGap (peakAvgs)")
    return errors


def main() -> int:
    errors: list[str] = []
    for path in FILES:
        if not path.is_file():
            errors.append(f"missing {path}")
            continue
        errors.extend(check(path))
    if errors:
        print("check_vocab_ref_pdf_grammar_badge_density FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_vocab_ref_pdf_grammar_badge_density: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
