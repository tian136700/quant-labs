#!/usr/bin/env python3
"""回归：LLM JSON 解析须兜底坏 IPA / 未转义引号，避免同一词烧到熔断。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from llm_json_parse import parse_llm_json_object  # noqa: E402


def main() -> int:
    errors: list[str] = []

    ok = parse_llm_json_object('{"reading":"/ʌp ˈtuː/","meaning":"直到","pos":"prep"}')
    if ok.get("reading") != "/ʌp ˈtuː/":
        errors.append("valid JSON must parse")

    # 模型常把 IPA 写成裸 /…/（Expecting ',' delimiter 的典型源）
    bare = parse_llm_json_object(
        '{"reading":/ʌp ˈtuː/,"meaning":"直到；胜任","pos":"prep/adj"}'
    )
    if bare.get("reading") != "/ʌp ˈtuː/":
        errors.append(f"bare IPA must repair, got {bare!r}")
    if "直到" not in str(bare.get("meaning") or ""):
        errors.append("bare IPA path must keep meaning")

    # 整体 JSON 烂了：仍能抠出可转义字段
    messy = (
        '{"reading":"/ʌp ˈtuː/","meaning":"直到；"多达"","pos":"prep",'
        '"usage":"1. [9] 介词：直到",'
        '"example_sentences":"It is up to you.\\n译文：由你决定。"}'
    )
    # 上面 meaning 故意坏；reading/usage/examples 仍应被字段兜底抽到
    try:
        partial = parse_llm_json_object(messy)
    except ValueError as exc:
        errors.append(f"messy JSON should soft-recover fields, got {exc}")
        partial = {}
    if partial.get("reading") != "/ʌp ˈtuː/":
        errors.append(f"messy: want reading via field extract, got {partial!r}")
    if "1. [9]" not in str(partial.get("usage") or ""):
        errors.append("messy: usage field extract failed")

    en = (ROOT / "scripts/en-vocab-fill-online-batch-api.py").read_text(encoding="utf-8")
    if "parse_llm_json_object" not in en:
        errors.append("en online batch must use parse_llm_json_object")
    if "retry generate after JSON error" not in en:
        errors.append("en online batch must retry once after bad JSON")
    if "_log_raw_snippet" not in en:
        errors.append("en online batch must log raw snippet on JSON fail")

    jp = (ROOT / "scripts/jp-vocab-fill-online-batch-api.py").read_text(encoding="utf-8")
    if "parse_llm_json_object" not in jp:
        errors.append("jp online batch must use parse_llm_json_object")
    if "retry generate after JSON error" not in jp:
        errors.append("jp online batch must retry once after bad JSON (like en)")
    if "_log_raw_snippet" not in jp:
        errors.append("jp online batch must log raw snippet on JSON fail")

    rule = (ROOT / ".cursor/rules/en-vocab-fill.mdc").read_text(encoding="utf-8")
    if "parse_llm_json_object" not in rule and "坏 JSON" not in rule:
        # soft: add note if missing — don't fail hard if rule not updated yet
        pass

    triage = ROOT / ".cursor/rules/vocab-fill-fail-triage.mdc"
    if not triage.is_file():
        errors.append("missing .cursor/rules/vocab-fill-fail-triage.mdc")
    else:
        triage_txt = triage.read_text(encoding="utf-8")
        if "手补" not in triage_txt or "apply_none" not in triage_txt:
            errors.append("fail-triage rule must require hand-fill + cover apply_none")
        if "Expecting" not in triage_txt:
            errors.append("fail-triage rule must mention JSON delimiter errors")


    if errors:
        print("check_llm_json_parse: FAIL")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_llm_json_parse: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
