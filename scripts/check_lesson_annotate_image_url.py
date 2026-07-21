#!/usr/bin/env python3
"""Regression: 随手画必须用教案图片 API，禁止把查看页 HTML 当 imageUrl。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CHECKS = [
    (
        ROOT / "src/components/JpLessonPage.tsx",
        {
            "must": [
                r"jpVocabRefApiPath\(lesson\.ref_key!,\s*\{\s*v:\s*ref\.updated_at\s*\}\)",
                r"setAnnotatingLesson\(\{\s*lesson,\s*ref:\s*ref!,\s*imageUrl\s*\}\)",
                r"imageUrl=\{annotatingLesson\?\.imageUrl",
            ],
            "forbid": [
                r"setAnnotatingLesson\(\{[^}]*viewUrl",
                r"imageUrl=\{annotatingLesson\?\.viewUrl",
            ],
        },
    ),
    (
        ROOT / "src/components/EnLessonPage.tsx",
        {
            "must": [
                r"enVocabRefApiPath\(lesson\.ref_key!,\s*\{\s*v:\s*ref\.updated_at\s*\}\)",
                r"setAnnotatingLesson\(\{\s*lesson,\s*ref:\s*ref!,\s*imageUrl\s*\}\)",
                r"imageUrl=\{annotatingLesson\?\.imageUrl",
            ],
            "forbid": [
                r"setAnnotatingLesson\(\{[^}]*viewUrl",
                r"imageUrl=\{annotatingLesson\?\.viewUrl",
            ],
        },
    ),
    (
        ROOT / "src/components/JpLessonAnnotateModal.tsx",
        {
            "must": [
                r'\["smear",\s*"涂抹"\]',
                r'SMEAR_COLOR\s*=\s*"#000000"',
                r'type:\s*"rect"',
                r"normalizeRect\(",
                r"tool === \"smear\"",
            ],
            "forbid": [
                r'SMEAR_COLOR\s*=\s*"#ffffff"',
                r"SMEAR_WIDTH",
            ],
        },
    ),
    (
        ROOT / "src/components/EnLessonAnnotateModal.tsx",
        {
            "must": [
                r'\["smear",\s*"涂抹"\]',
                r'SMEAR_COLOR\s*=\s*"#000000"',
                r'type:\s*"rect"',
                r"normalizeRect\(",
                r"tool === \"smear\"",
            ],
            "forbid": [
                r'SMEAR_COLOR\s*=\s*"#ffffff"',
                r"SMEAR_WIDTH",
            ],
        },
    ),
]


def main() -> int:
    failed = False
    for path, spec in CHECKS:
        text = path.read_text(encoding="utf-8")
        for pat in spec["must"]:
            if not re.search(pat, text):
                print(f"FAIL {path.relative_to(ROOT)}: missing /{pat}/")
                failed = True
        for pat in spec["forbid"]:
            if re.search(pat, text):
                print(f"FAIL {path.relative_to(ROOT)}: forbidden /{pat}/")
                failed = True
    if failed:
        return 1
    print("OK: lesson annotate uses image API + smear tool")
    return 0


if __name__ == "__main__":
    sys.exit(main())
