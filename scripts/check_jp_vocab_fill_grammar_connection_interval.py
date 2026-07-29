#!/usr/bin/env python3
"""回归：语法接序专用 launchd 须 60s；与用法+例句 600s 任务分开。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "scripts" / "com.infoquests.jp-vocab-fill-grammar-connection.plist.example"
SETUP = ROOT / "scripts" / "setup-jp-vocab-fill-grammar-connection-mac.sh"
STAGE = ROOT / "scripts" / "jp-vocab-fill-grammar-connection-stage.sh"
SCRIPT = ROOT / "scripts" / "jp-vocab-fill-grammar-connection-api.py"
ROUTE = ROOT / "src/app/api/jp-vocab/fill-usage/route.ts"
FILL = ROOT / "src/lib/jp-vocab-fill-usage.ts"
USAGE_AI = ROOT / "src/lib/jp-vocab-usage-ai.ts"
MIN_SEC = 60


def main() -> int:
    errors: list[str] = []

    for path in (EXAMPLE, SETUP, STAGE, SCRIPT):
        if not path.is_file():
            errors.append(f"缺少 {path.relative_to(ROOT)}")

    if EXAMPLE.is_file():
        text = EXAMPLE.read_text(encoding="utf-8")
        m = re.search(
            r"<key>StartInterval</key>\s*<integer>(\d+|__INTERVAL__)</integer>",
            text,
        )
        iv = MIN_SEC if m and m.group(1) == "__INTERVAL__" else int(m.group(1)) if m else None
        if iv is not None and iv < MIN_SEC:
            errors.append(f"connection plist StartInterval={iv} < {MIN_SEC}")

    if SETUP.is_file():
        setup = SETUP.read_text(encoding="utf-8")
        if "JP_VOCAB_FILL_GRAMMAR_CONNECTION_INTERVAL_SECONDS:-60" not in setup:
            errors.append("setup 默认间隔须为 60")
        if "-lt 60" not in setup:
            errors.append("setup 须拒绝 <60 的间隔")

    if SCRIPT.is_file():
        body = SCRIPT.read_text(encoding="utf-8")
        if "list_missing_connection" not in body:
            errors.append("接序脚本须调 list_missing_connection")

    if ROUTE.is_file() and "list_missing_connection" not in ROUTE.read_text(encoding="utf-8"):
        errors.append("fill-usage route 须支持 list_missing_connection")

    if FILL.is_file() and "listJpVocabGrammarMissingConnection" not in FILL.read_text(
        encoding="utf-8"
    ):
        errors.append("fill-usage 须 export listJpVocabGrammarMissingConnection")

    if USAGE_AI.is_file():
        u = USAGE_AI.read_text(encoding="utf-8")
        if "if (!hasJpVocabConnection(connection)) return false;" in u.split(
            "isJpVocabConjugationGrammar(word)"
        )[0]:
            errors.append("变形课完成判定须在接序检查之前（不要接序）")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print(f"ok: grammar connection fill interval >= {MIN_SEC}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
