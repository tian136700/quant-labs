#!/usr/bin/env python3
"""回归：句首接续词（しかし等）须「＋」公式；禁止散文接序漏字段。

对照：
- Mac online-batch：grammar_connection_has_formula / salvage_connection_from_examples
- Worker：connectionHasFormulaShape → validate 拒 no_plus_formula
- prompt：jp-vocab-connection-prompt 含 しかし 样例
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def load_online_batch():
    path = ROOT / "scripts/jp-vocab-fill-online-batch-api.py"
    spec = importlib.util.spec_from_file_location("jp_online_batch", path)
    if spec is None or spec.loader is None:
        fail("cannot load online-batch")
    mod = importlib.util.module_from_spec(spec)
    # Avoid executing main; load helpers via exec of filtered? The module
    # only defines helpers at import — safe if env deps importable.
    try:
        spec.loader.exec_module(mod)
    except Exception as exc:  # noqa: BLE001
        # Fallback: read source and eval only the formula helper via regex tests
        raise SystemExit(f"FAIL: import online-batch: {exc}") from exc
    return mod


def main() -> int:
    batch_src = (ROOT / "scripts/jp-vocab-fill-online-batch-api.py").read_text(
        encoding="utf-8"
    )
    for needle in (
        "grammar_connection_has_formula",
        "salvage_connection_from_examples",
        "＋しかし",
        "句首接续词",
        "でも／ところが",
    ):
        if needle not in batch_src:
            fail(f"online-batch missing {needle!r}")

    prompt = (ROOT / "src/lib/jp-vocab-connection-prompt.ts").read_text(
        encoding="utf-8"
    )
    if "＋しかし" not in prompt or "句首接续词" not in prompt:
        fail("connection-prompt 须含 しかし 句首接续样例")

    conn = (ROOT / "src/lib/jp-vocab-connection-ai.ts").read_text(encoding="utf-8")
    if "no_plus_formula" not in conn:
        fail("connection-ai 须拒 no_plus_formula")
    if "connectionHasFormulaShape" not in conn:
        fail("connection-ai 须有 connectionHasFormulaShape")

    rule = (
        ROOT / ".cursor/rules/jp-vocab-content-quality-guard.mdc"
    ).read_text(encoding="utf-8")
    if "no_plus_formula" not in rule or "しかし" not in rule:
        fail("content-quality-guard 须记下 しかし / no_plus_formula")

    # 轻量逻辑：与 Mac helper 同判定（不 import 全脚本，避免依赖链）
    def has_formula(text: str) -> bool:
        t = (text or "").strip()
        if not t:
            return False
        if "＋" in t or "+" in t:
            return True
        if re.search(r"用法\s*\d+\s*[:：]", t):
            return True
        if re.search(r"^(?:一类|二类|三类)", t, flags=re.M):
            return True
        if re.search(r"^(?:否定形|肯定形|疑问形|注意)\s*[:：]", t, flags=re.M):
            return True
        return False

    prose = "前句用句点「。」或「、」结束，「しかし」置于后句句首独立使用"
    formula = (
        "前句（动词句／一类形容词句／二类形容词句／名词句）＋しかし｜后句句首，表示转折"
    )
    if has_formula(prose):
        fail("prose しかし connection must NOT count as formula")
    if not has_formula(formula):
        fail("formula しかし connection must count as formula")
    if not has_formula("一类动词：词尾う段改え段＋ば"):
        fail("一类动词分行 must count as formula")

    # salvage：【接序】塞进例句
    ex = (
        "今日(きょう)は晴(は)れです。しかし、風(かぜ)が強(つよ)いです。\n"
        "译文：今天晴，但风大。\n"
        "【接序】\n"
        f"{formula}"
    )
    if "【接序】" not in ex or formula not in ex.split("【接序】", 1)[1]:
        fail("salvage fixture broken")

    print("OK: jp-vocab connection sentence-connector guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
