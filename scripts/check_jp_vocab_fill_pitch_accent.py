#!/usr/bin/env python3
"""回归：OJAD 查无标 OJAD_NONE；UI/定时不反复死磕。"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    fill = (ROOT / "src/lib/jp-vocab-fill-pitch-accent.ts").read_text(encoding="utf-8")
    if "OJAD_NONE" not in fill and "JP_VOCAB_PITCH_ACCENT_SOURCE_NONE" not in fill:
        fail("missing OJAD_NONE marker")
    if "markJpVocabPitchAccentNotFound" not in fill:
        fail("missing markJpVocabPitchAccentNotFound")
    if "pitch_accent_source IS NULL" not in fill:
        fail("list_missing must skip already-marked sources")

    route = (
        ROOT / "src/app/api/jp-vocab/fill-pitch-accent/route.ts"
    ).read_text(encoding="utf-8")
    if "mark_not_found" not in route:
        fail("API must support mark_not_found")

    py = (ROOT / "scripts/jp-vocab-fill-pitch-accent-api.py").read_text(encoding="utf-8")
    if "mark_not_found" not in py:
        fail("cron client must mark OJAD misses")

    stage = (ROOT / "scripts/jp-vocab-fill-pitch-accent-stage.sh").read_text(
        encoding="utf-8"
    )
    if "jp-vocab-fill-pitch-accent-api.py" not in stage:
        fail("stage script missing")

    setup = (ROOT / "scripts/setup-jp-vocab-fill-pitch-accent-mac.sh").read_text(
        encoding="utf-8"
    )
    if "StartInterval" not in setup and "60" not in setup:
        fail("setup should install ~60s interval")

    print("ok: OJAD miss → OJAD_NONE; cron 1min fill pitch")


if __name__ == "__main__":
    main()
