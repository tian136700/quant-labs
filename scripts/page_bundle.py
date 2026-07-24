"""Shared helper: concatenate page + sibling *-page/ directory for regression scripts."""

from __future__ import annotations

from pathlib import Path


def read_page_bundle(page: Path, sibling_dir: Path | None = None) -> str:
    """Page + optional extracted `*-page/` directory (Styles / Table / helpers)."""
    parts = [page.read_text(encoding="utf-8")]
    if sibling_dir is not None and sibling_dir.is_dir():
        for p in sorted(sibling_dir.glob("*.tsx")):
            parts.append(p.read_text(encoding="utf-8"))
        for p in sorted(sibling_dir.glob("*.ts")):
            parts.append(p.read_text(encoding="utf-8"))
    return "\n".join(parts)
