#!/usr/bin/env python3
"""回归：预览打开须关旧标签，只留最新。"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    helper = (ROOT / "scripts/lib/open_preview_browser.py").read_text(encoding="utf-8")
    if "open_preview_url" not in helper:
        fail("missing open_preview_url")
    if "PREVIEW_PATH_MARKERS" not in helper:
        fail("missing PREVIEW_PATH_MARKERS")
    if "close tab" not in helper.lower() and "close tab" not in helper:
        # AppleScript uses "close tab"
        if "close tab" not in helper:
            fail("must close previous preview tabs via AppleScript")

    preview = (ROOT / "scripts/open_jp_vocab_card_preview.py").read_text(encoding="utf-8")
    if "open_preview_url" not in preview:
        fail("open_jp_vocab_card_preview must use open_preview_url")
    if 'subprocess.run(["open"' in preview:
        fail("must not raw open() without closing old preview tabs")

    print("ok: preview open closes previous debug tabs")


if __name__ == "__main__":
    main()
