#!/usr/bin/env python3
"""Regression: /en-vocab/study shared list is newest-first (shared_at DESC).

Students expect the word just quizzed/shared at the top; earliest share at the bottom.
JP already uses DESC; EN must match.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EN_SHARE = ROOT / "src/lib/en-vocab-db/share.ts"
JP_SHARE = ROOT / "src/lib/jp-vocab-db/share.ts"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def extract_fn(src: str, name: str) -> str:
    m = re.search(
        rf"export async function {re.escape(name)}\([\s\S]*?\n\}}(?:\n|$)",
        src,
    )
    if not m:
        fail(f"missing export async function {name}")
    return m.group(0)


def check_query(path: Path, lang: str) -> None:
    src = path.read_text(encoding="utf-8")
    body = extract_fn(src, f"query{lang}VocabSharedToday")
    if "ORDER BY s.shared_at DESC" not in body and "ORDER BY s.shared_at DESC, s.id DESC" not in body:
        if not re.search(r"ORDER BY s\.shared_at DESC", body):
            fail(
                f"{lang}: query*SharedToday SQL must ORDER BY shared_at DESC "
                "(newest quizzed/shared first on study page)"
            )
    if re.search(r"ORDER BY s\.shared_at ASC", body):
        fail(f"{lang}: query*SharedToday must not ASC (oldest-first is wrong for study)")
    # dev-store sort: b.shared_at before a (DESC)
    if "devStoreEnabled" in body:
        if not re.search(
            r"b\.shared_at\.localeCompare\(a\.shared_at\)",
            body,
        ):
            fail(
                f"{lang}: devStore sort must be b.shared_at.localeCompare(a.shared_at) "
                "(newest first)"
            )
        if re.search(r"a\.shared_at\.localeCompare\(b\.shared_at\)", body):
            fail(f"{lang}: devStore sort must not be ascending")
    print(f"OK: {path.relative_to(ROOT)} newest-first")


def main() -> None:
    for path, lang in ((EN_SHARE, "En"), (JP_SHARE, "Jp")):
        if not path.is_file():
            fail(f"missing {path}")
        check_query(path, lang)
    print("All shared-today newest-first guards passed.")


if __name__ == "__main__":
    main()
