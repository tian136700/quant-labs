#!/usr/bin/env python3
"""回归：英语缩写释义须含完整英文展开（prompt + normalize）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

MEANING_TS = ROOT / "src" / "lib" / "en-vocab-meaning-ai.ts"
ONLINE = ROOT / "scripts" / "en-vocab-fill-online-batch-api.py"
MEANING_PY = ROOT / "scripts" / "en-vocab-fill-meaning-api.py"
RULE = ROOT / ".cursor" / "rules" / "en-vocab-fill.mdc"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    for path in (MEANING_TS, ONLINE, MEANING_PY, RULE):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    meaning = MEANING_TS.read_text(encoding="utf-8")
    for needle in (
        "Department of Motor Vehicles",
        "account；账户",
        "LATIN_EXPANSION_RE",
        "缩写/简写必须在释义里写出完整英文拼写",
        "MEANING_MAX_LEN = 120",
        "chineseSenses",
    ):
        if needle not in meaning:
            fail(f"en-vocab-meaning-ai.ts missing: {needle}")

    online = ONLINE.read_text(encoding="utf-8")
    if "Department of Motor Vehicles" not in online:
        fail("online-batch must prompt for abbreviation full form in meaning")
    if "full English expansion" not in online:
        fail("online-batch SYSTEM must mention abbreviation expansion")

    meaning_py = MEANING_PY.read_text(encoding="utf-8")
    if "Department of Motor Vehicles" not in meaning_py:
        fail("local meaning-api fallback prompt must mention abbrev expansion")
    if "MEANING_MAX_LEN = 120" not in meaning_py:
        fail("local meaning-api must allow longer meanings with expansion")
    if "_LATIN_EXPANSION_RE" not in meaning_py:
        fail("local meaning-api must keep Latin expansion as first segment")

    rule = RULE.read_text(encoding="utf-8")
    if "缩写/简写：释义须先写完整英文全称" not in rule:
        fail("en-vocab-fill.mdc must document abbrev meaning format")

    # Smoke: Python normalize keeps expansion + Chinese senses
    sys.path.insert(0, str(ROOT / "scripts"))
    from importlib.util import module_from_spec, spec_from_file_location

    spec = spec_from_file_location(
        "en_vocab_fill_meaning_api", MEANING_PY
    )
    assert spec and spec.loader
    mod = module_from_spec(spec)
    spec.loader.exec_module(mod)

    raw = "Department of Motor Vehicles；车辆管理局；驾照考试机构"
    text, err = mod.validate_meaning(raw)
    if err or text != raw:
        fail(f"validate_meaning failed: err={err!r} text={text!r}")

    plain = "期待；盼望"
    text2, err2 = mod.validate_meaning(plain)
    if err2 or text2 != plain:
        fail(f"plain meaning broken: err={err2!r} text={text2!r}")

    letter = "account；账户"
    text3, err3 = mod.validate_meaning(letter)
    if err3 or text3 != letter:
        fail(f"letter abbrev meaning broken: err={err3!r} text={text3!r}")

    # Too many Chinese senses still rejected after expansion
    too_many = "DMV Full；一；二；三；四"
    # normalize keeps expansion only if Latin; "DMV Full" matches Latin re
    text4, err4 = mod.validate_meaning(too_many)
    if err4:
        fail(f"unexpected reject for truncated senses: {err4}")
    if text4 is None or text4.count("；") > 3:
        fail(f"should keep expansion + ≤3 Chinese: {text4!r}")
    chinese = [p for p in text4.split("；") if re.search(r"[\u4E00-\u9FFF]", p)]
    if len(chinese) != 3:
        fail(f"expected 3 Chinese senses, got {chinese!r} from {text4!r}")

    print("ok: en-vocab abbrev meaning prompt + normalize")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
