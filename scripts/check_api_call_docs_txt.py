#!/usr/bin/env python3
"""Regression: external/cross-project APIs must have docs/*-api.txt + index."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

# 已知给其它项目调用的接口 → 必须有对应 TXT
REQUIRED: list[tuple[str, str]] = [
    ("src/app/api/jp-lesson/route.ts", "docs/jp-lesson-api.txt"),
    ("src/app/api/jp-lesson/upload-mixed/route.ts", "docs/jp-lesson-upload-mixed-api.txt"),
    ("src/app/api/en-vocab/local-upload/route.ts", "docs/en-vocab-local-upload-api.txt"),
    ("src/app/api/en-vocab/route.ts", "docs/en-vocab-api.txt"),
    ("src/app/api/jp-vocab/route.ts", "docs/jp-vocab-api.txt"),
    ("src/app/api/jp-vocab/exists/route.ts", "docs/jp-vocab-exists-api.txt"),
    ("src/app/api/jp-vocab/download-all/route.ts", "docs/jp-vocab-download-all-api.txt"),
    (
        "src/app/api/jp-vocab/fill-example-sentences/route.ts",
        "docs/jp-vocab-fill-example-sentences-api.txt",
    ),
]


def main() -> int:
    errors: list[str] = []

    for route, doc in REQUIRED:
        route_path = ROOT / route
        doc_path = ROOT / doc
        if not route_path.is_file():
            errors.append(f"missing route {route}")
            continue
        if not doc_path.is_file():
            errors.append(f"missing docs for {route} → expected {doc}")
            continue
        text = doc_path.read_text(encoding="utf-8")
        if "/api/" not in text:
            errors.append(f"{doc}: must document /api/ path")
        if "Authorization" not in text and "鉴权" not in text:
            errors.append(f"{doc}: must document auth")
        if "curl" not in text.lower() and "Python" not in text:
            errors.append(f"{doc}: should include curl or Python example")

    index = ROOT / "docs/external-apis-for-copy.txt"
    if not index.is_file():
        errors.append("missing docs/external-apis-for-copy.txt (run refresh_external_api_docs_index.py)")
    else:
        idx = index.read_text(encoding="utf-8")
        for _, doc in REQUIRED:
            if doc not in idx and pathlib.Path(doc).name not in idx:
                errors.append(f"index missing entry for {doc}")

    rule = ROOT / ".cursor/rules/api-call-docs-txt.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/api-call-docs-txt.mdc")

    session = ROOT / ".cursor/hooks/api-docs-txt-session.py"
    stop = ROOT / ".cursor/hooks/api-docs-txt-stop.py"
    if not session.is_file():
        errors.append("missing .cursor/hooks/api-docs-txt-session.py")
    if not stop.is_file():
        errors.append("missing .cursor/hooks/api-docs-txt-stop.py")

    if errors:
        print("FAIL: api call docs txt")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("ok: api call docs txt")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
