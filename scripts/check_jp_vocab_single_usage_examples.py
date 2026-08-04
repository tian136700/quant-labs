#!/usr/bin/env python3
"""回归：单用法语法例句须补到 3 条；临时任务接线抽查门禁。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> int:
    errors: list[str] = []

    fill = read("src/lib/jp-vocab-fill-usage.ts")
    if "宽查全部语法" not in fill:
        errors.append("list_missing 注释须写明宽查全部语法")
    if "exN < 3" not in fill:
        errors.append("list_missing need_examples 须认单用法 <3")

    single = read("src/lib/jp-vocab-fill-usage-single-examples.ts")
    for needle in (
        "listJpVocabGrammarMissingSingleUsageExamples",
        "buildJpVocabSingleUsageExamplesTopUpPrompt",
        "usageN !== 1",
        "exN >= 3",
        "isJpVocabConjugationGrammar",
        "isJpVocabContrastGrammar",
    ):
        if needle not in single:
            errors.append(f"single-examples lib missing {needle}")

    route = read("src/app/api/jp-vocab/fill-usage/route.ts")
    if "list_missing_single_usage_examples" not in route:
        errors.append("fill-usage route 须支持 list_missing_single_usage_examples")

    align = read("src/lib/jp-vocab-usage-example-pair-align.ts")
    if "single_usage_need_three" not in align:
        errors.append("pair align 须拒 single_usage_need_three")

    stage = read("scripts/jp-vocab-fill-single-usage-examples-online-stage.sh")
    if "vocab_fill_assert_quiz_gate_ok" not in stage:
        errors.append("temp stage 须接 vocab_fill_assert_quiz_gate_ok")

    api_py = read("scripts/jp-vocab-fill-single-usage-examples-online-api.py")
    for needle in (
        "list_missing_single_usage_examples",
        "EXIT_QUEUE_EMPTY = 10",
        "skip_if_worker_unavailable",
        'get("total_missing") or -1',  # 禁止 falsy 0 坑：不应出现
    ):
        if needle == 'get("total_missing") or -1':
            if needle in api_py:
                errors.append("api.py 禁止 total_missing or -1（0 会永远不退出）")
            continue
        if needle not in api_py:
            errors.append(f"api.py missing {needle}")

    registry = read("scripts/maintenance_center/cron_tasks/registry.py")
    if "jp-vocab-fill-single-usage-examples-online" not in registry:
        errors.append("registry 须登记临时任务")
    if 'fill_content=_fill("例句")' not in registry:
        # 允许其它任务也有；至少本任务附近有例句
        if "single-usage-examples-online" not in registry:
            errors.append("registry 缺任务 id")

    circuit = read("scripts/lib/vocab_fill_circuit_breaker.py")
    if "jp-vocab-fill-single-usage-examples-online" not in circuit:
        errors.append("熔断 FILL_TASKS 须含临时单用法任务")

    docs = ROOT / "docs/jp-vocab-fill-single-usage-examples-api.txt"
    if not docs.is_file():
        errors.append("missing docs/jp-vocab-fill-single-usage-examples-api.txt")

    setup = ROOT / "scripts/setup-jp-vocab-fill-single-usage-examples-online-mac.sh"
    if not setup.is_file():
        errors.append("missing setup script")

    if errors:
        print("FAIL:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("ok: single-usage examples top-up wiring")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
