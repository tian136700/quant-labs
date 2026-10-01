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
    pitch_stage = ROOT / "scripts/jp-vocab-fill-pitch-accent-stage.sh"
    pitch_api = ROOT / "scripts/jp-vocab-fill-pitch-accent-api.py"
    backoff_py = ROOT / "scripts/lib/vocab_fill_empty_backoff.py"
    jp_batch = ROOT / "scripts/jp-vocab-fill-online-batch-api.py"
    en_batch = ROOT / "scripts/en-vocab-fill-online-batch-api.py"

    for path in (
        backoff_py,
        jp_stage,
        en_stage,
        pitch_stage,
        pitch_api,
        jp_batch,
        en_batch,
    ):
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
        # 线上非 reading 须在 quiz gate 之前 skip，避免每分钟白打门禁
        gate_idx = text.find("vocab_fill_assert_quiz_gate_ok")
        online_skip_idx = text.find('online backend → skip stage')
        if online_skip_idx < 0:
            errors.append("en-vocab-fill-stage.sh missing online non-reading skip")
        elif gate_idx < 0 or online_skip_idx > gate_idx:
            errors.append(
                "en-vocab-fill-stage.sh must skip online non-reading BEFORE quiz gate"
            )

    nightly = ROOT / "scripts/en-vocab-fill-nightly.sh"
    if not nightly.is_file():
        errors.append("missing en-vocab-fill-nightly.sh")
    else:
        text = nightly.read_text(encoding="utf-8")
        if "online backend → reading only" not in text:
            errors.append("en-vocab-fill-nightly.sh must short-circuit online to reading only")
        if 'exec bash "$ROOT/scripts/en-vocab-fill-stage.sh" reading' not in text and \
           "en-vocab-fill-stage.sh\" reading" not in text:
            # accept either quoting style
            if "en-vocab-fill-stage.sh" not in text or "reading" not in text:
                errors.append("en-vocab-fill-nightly.sh online path must run reading stage")

    if pitch_stage.is_file():
        text = pitch_stage.read_text(encoding="utf-8")
        if "vocab_fill_empty_backoff.py" not in text:
            errors.append("jp-vocab-fill-pitch-accent-stage.sh missing backoff")
        if "empty queue backoff" not in text:
            errors.append("pitch stage missing backoff skip message")

    if pitch_api.is_file():
        text = pitch_api.read_text(encoding="utf-8")
        if "record_empty" not in text or "record_nonempty" not in text:
            errors.append("pitch accent api missing record_empty/nonempty")

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
