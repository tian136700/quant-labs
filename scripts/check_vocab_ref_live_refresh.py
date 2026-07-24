#!/usr/bin/env python3
"""Regression: 教案查看页须能感知随手画保存后的 updated_at；禁止长 max-age。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_page_bundle(page: Path, sibling_dir: Path | None = None) -> str:
    """Page + optional extracted sibling directory (Styles / save / draw)."""
    parts = [page.read_text(encoding="utf-8")]
    if sibling_dir is not None and sibling_dir.is_dir():
        for p in sorted(sibling_dir.glob("*.tsx")):
            parts.append(p.read_text(encoding="utf-8"))
        for p in sorted(sibling_dir.glob("*.ts")):
            parts.append(p.read_text(encoding="utf-8"))
    return "\n".join(parts)


def read_check_text(path: Path) -> str:
    annotate_modal = ROOT / "src/components/lesson-annotate/LessonAnnotateModal.tsx"
    if path == annotate_modal:
        return read_page_bundle(path, ROOT / "src/components/lesson-annotate")
    return path.read_text(encoding="utf-8")


CHECKS = [
    (
        ROOT / "src/app/api/jp-vocab/ref/[refKey]/route.ts",
        {
            "must": [
                r'searchParams\.get\("meta"\)\s*===\s*"1"',
                r"updated_at:\s*ref\.updated_at",
                r"private,\s*max-age=0,\s*must-revalidate",
            ],
            "forbid": [
                r'max-age=3600',
            ],
        },
    ),
    (
        ROOT / "src/app/api/en-vocab/ref/[refKey]/route.ts",
        {
            "must": [
                r'searchParams\.get\("meta"\)\s*===\s*"1"',
                r"updated_at:\s*ref\.updated_at",
                r"private,\s*max-age=0,\s*must-revalidate",
            ],
            "forbid": [
                r'max-age=3600',
            ],
        },
    ),
    (
        ROOT / "src/components/JpVocabRefViewer.tsx",
        {
            "must": [
                r"useVocabRefLiveVersion",
                r'subject:\s*"jp"',
                r"liveUpdatedAt",
            ],
            "forbid": [
                r"location\.reload\(",
            ],
        },
    ),
    (
        ROOT / "src/components/EnVocabRefViewer.tsx",
        {
            "must": [
                r"useVocabRefLiveVersion",
                r'subject:\s*"en"',
                r"liveUpdatedAt",
            ],
            "forbid": [
                r"location\.reload\(",
            ],
        },
    ),
    (
        ROOT / "src/components/lesson-annotate/LessonAnnotateModal.tsx",
        {
            "must": [
                r"notifyVocabRefUpdated",
                r"subject,",
                r'subject === "jp" \? "/api/jp-lesson/ref/replace"',
            ],
            "forbid": [],
        },
    ),
    (
        ROOT / "src/components/JpLessonAnnotateModal.tsx",
        {
            "must": [
                r'subject="jp"',
                r"LessonAnnotateModal",
            ],
            "forbid": [],
        },
    ),
    (
        ROOT / "src/components/EnLessonAnnotateModal.tsx",
        {
            "must": [
                r'subject="en"',
                r"LessonAnnotateModal",
            ],
            "forbid": [],
        },
    ),
    (
        ROOT / "src/lib/useVocabRefLiveVersion.ts",
        {
            "must": [
                r"VOCAB_REF_LIVE_POLL_MS",
                r"VOCAB_REF_LIVE_POLL_HIDDEN_MS",
                r"vocabRefMetaApiPath",
                r"visibilitychange",
            ],
            "forbid": [
                r"location\.reload\(",
            ],
        },
    ),
]


def main() -> int:
    failed = False
    for path, spec in CHECKS:
        text = read_check_text(path)
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
    print("OK check_vocab_ref_live_refresh")
    return 0


if __name__ == "__main__":
    sys.exit(main())
