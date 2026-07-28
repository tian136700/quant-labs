#!/usr/bin/env python3
"""回归：语法补全 launchd 须 ≥600s，禁止再装回每分钟打线上。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "scripts" / "com.infoquests.jp-vocab-fill-grammar.plist.example"
SETUP = ROOT / "scripts" / "setup-jp-vocab-fill-grammar-mac.sh"
STAGE = ROOT / "scripts" / "jp-vocab-fill-grammar-stage.sh"
MIN_SEC = 600


def _interval_from_plist(text: str) -> int | None:
    m = re.search(
        r"<key>StartInterval</key>\s*<integer>(\d+|__INTERVAL__)</integer>",
        text,
    )
    if not m:
        return None
    raw = m.group(1)
    if raw == "__INTERVAL__":
        return MIN_SEC  # setup 默认注入 600
    return int(raw)


def main() -> int:
    errors: list[str] = []

    if not EXAMPLE.is_file():
        errors.append(f"缺少 {EXAMPLE.relative_to(ROOT)}")
    else:
        text = EXAMPLE.read_text(encoding="utf-8")
        if "__INTERVAL__" not in text and _interval_from_plist(text) not in (
            None,
            MIN_SEC,
        ):
            iv = _interval_from_plist(text)
            if iv is not None and iv < MIN_SEC:
                errors.append(f"plist.example StartInterval={iv} < {MIN_SEC}")

    if not SETUP.is_file():
        errors.append(f"缺少 {SETUP.relative_to(ROOT)}")
    else:
        setup = SETUP.read_text(encoding="utf-8")
        if "JP_VOCAB_FILL_GRAMMAR_INTERVAL_SECONDS:-600" not in setup:
            errors.append("setup 默认间隔须为 600")
        if "RUN_INTERVAL" not in setup or "-lt 600" not in setup:
            errors.append("setup 须拒绝 <600 的间隔")

    stage = STAGE.read_text(encoding="utf-8")
    if "每分钟" in stage:
        errors.append("jp-vocab-fill-grammar-stage.sh 文案仍写「每分钟」")

    home_plist = (
        Path.home()
        / "Library"
        / "LaunchAgents"
        / "com.infoquests.jp-vocab-fill-grammar.plist"
    )
    if home_plist.is_file():
        live = home_plist.read_text(encoding="utf-8", errors="replace")
        m = re.search(
            r"<key>StartInterval</key>\s*<integer>(\d+)</integer>", live
        )
        if m and int(m.group(1)) < MIN_SEC:
            errors.append(
                f"本机 LaunchAgent StartInterval={m.group(1)} < {MIN_SEC}；"
                "请跑 bash scripts/setup-jp-vocab-fill-grammar-mac.sh"
            )

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print(f"ok: grammar fill interval >= {MIN_SEC}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
