#!/usr/bin/env python3
"""回归：释义不可把【释义】区块标题写进 meaning。"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "jp-vocab-fill-meaning-api.py"


def load_script():
    spec = importlib.util.spec_from_file_location("jp_vocab_fill_meaning_api", SCRIPT)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    # 避免执行 main
    code = SCRIPT.read_text(encoding="utf-8")
    # 只加载到 main 之前的函数
    cut = code.find("\ndef main() -> int:")
    if cut < 0:
        raise SystemExit("script missing main()")
    exec(compile(code[:cut], str(SCRIPT), "exec"), mod.__dict__)
    return mod


def main() -> int:
    mod = load_script()
    errors: list[str] = []

    bad, reason = mod.validate_meaning("【释义】")
    if bad is not None or reason != "meta_label":
        errors.append(f"纯【释义】应拒 meta_label，得到 {bad!r}/{reason!r}")

    ok, reason = mod.validate_meaning("很多；大量")
    if ok != "很多；大量" or reason is not None:
        errors.append(f"正常释义应通过，得到 {ok!r}/{reason!r}")

    ok2, _ = mod.validate_meaning("【释义】\n很多；大量")
    if ok2 != "很多；大量":
        errors.append(f"区块+正文应剥标题得到正文，得到 {ok2!r}")

    ok3, _ = mod.validate_meaning("【释义】很多；大量")
    if ok3 != "很多；大量":
        errors.append(f"同行标题前缀应剥掉，得到 {ok3!r}")

    m, p, e = mod.parse_combo_output(
        "【释义】很多；大量\n【词性】\n副词",
        need_meaning=True,
        need_pos=True,
        need_examples=False,
    )
    if m != "很多；大量":
        errors.append(f"parse 同行标题失败 meaning={m!r}")
    if p != "副词":
        errors.append(f"parse 词性失败 pos={p!r}")

    m2, _, _ = mod.parse_combo_output(
        "【释义】\n【词性】\n副词",
        need_meaning=True,
        need_pos=True,
        need_examples=False,
    )
    if m2 is not None:
        errors.append(f"空释义区块不应产出 meaning，得到 {m2!r}")

    if errors:
        print("FAIL:")
        for err in errors:
            print(" -", err)
        return 1
    print("ok: jp-vocab meaning meta_label guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
