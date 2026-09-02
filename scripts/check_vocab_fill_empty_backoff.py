#!/usr/bin/env python3
"""词表补全空队列降频：stage 接线 + backoff 状态机。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    jp_stage = ROOT / "scripts/jp-vocab-fill-unified-stage.sh"
    en_stage = ROOT / "scripts/en-vocab-fill-stage.sh"
    backoff_py = ROOT / "scripts/lib/vocab_fill_empty_backoff.py"
    jp_batch = ROOT / "scripts/jp-vocab-fill-online-batch-api.py"
    en_batch = ROOT / "scripts/en-vocab-fill-online-batch-api.py"

    for path in (backoff_py, jp_stage, en_stage, jp_batch, en_batch):
        if not path.is_file():
            errors.append(f"missing {path.relative_to(ROOT)}")

    if jp_stage.is_file():
        text = jp_stage.read_text(encoding="utf-8")
        if "vocab_fill_empty_backoff.py" not in text:
            errors.append("jp-vocab-fill-unified-stage.sh missing backoff")
        if "empty queue backoff" not in text:
            errors.append("jp stage missing backoff skip message")

    if en_stage.is_file():
        text = en_stage.read_text(encoding="utf-8")
        if "vocab_fill_empty_backoff.py" not in text:
            errors.append("en-vocab-fill-stage.sh missing backoff")

    if jp_batch.is_file():
        text = jp_batch.read_text(encoding="utf-8")
        if "record_empty" not in text or "record_nonempty" not in text:
            errors.append("jp online batch missing record_empty/nonempty")
        if "fill-next-candidate" not in text:
            errors.append("jp online batch missing fill-next-candidate")

    if en_batch.is_file():
        text = en_batch.read_text(encoding="utf-8")
        if "record_empty" not in text:
            errors.append("en online batch missing record_empty")
        if "fill-next-candidate" not in text:
            errors.append("en online batch missing fill-next-candidate")

    estimate = ROOT / "src/lib/d1-quota-estimate.ts"
    if not estimate.is_file():
        errors.append("missing d1-quota-estimate.ts")
    else:
        db = ROOT / "src/lib/d1-quota-db.ts"
        if "read_burden" not in db.read_text(encoding="utf-8"):
            errors.append("d1-quota-db missing read_burden")

    if errors:
        print("check_vocab_fill_empty_backoff.py FAILED:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print("check_vocab_fill_empty_backoff.py OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
