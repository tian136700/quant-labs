#!/usr/bin/env python3
"""回归：同一词 3 次未搞定 → 熔断停掉全部 JP/EN fill launchd。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []
    br = (ROOT / "scripts/lib/vocab_fill_circuit_breaker.py").read_text(
        encoding="utf-8"
    )
    sh = (ROOT / "scripts/lib/vocab_fill_circuit_breaker.sh").read_text(
        encoding="utf-8"
    )
    grammar = (
        ROOT / "scripts/jp-vocab-fill-grammar-usage-examples-api.py"
    ).read_text(encoding="utf-8")
    gstage = (ROOT / "scripts/jp-vocab-fill-grammar-stage.sh").read_text(
        encoding="utf-8"
    )
    jstage = (ROOT / "scripts/jp-vocab-fill-stage.sh").read_text(encoding="utf-8")
    estage = (ROOT / "scripts/en-vocab-fill-stage.sh").read_text(encoding="utf-8")
    jread = (ROOT / "scripts/jp-vocab-fill-reading-nightly.sh").read_text(
        encoding="utf-8"
    )
    rule = (
        ROOT / ".cursor/rules/vocab-fill-circuit-breaker.mdc"
    ).read_text(encoding="utf-8")

    if "DEFAULT_MAX_ATTEMPTS = 3" not in br:
        errors.append("熔断默认须 3 次")
    if "bootout_all_fill_launchd" not in br:
        errors.append("须 bootout 全部 JP/EN fill launchd")
    if '"history"' not in br and "history" not in br:
        errors.append("须记录每次失败 history（第几次+原因）")
    if "format_attempt_report" not in br:
        errors.append("须有三次失败人读报告")
    if "KILL_REPORT_PATH" not in br:
        errors.append("须写 vocab-fill-KILL-report.txt")
    if "com.infoquests.jp-vocab-fill-grammar" not in br:
        errors.append("KILL 列表须含 jp-vocab-fill-grammar")
    if "com.infoquests.en-vocab-fill-examples" not in br:
        errors.append("KILL 列表须含 en-vocab fill")
    if "vocab_fill_circuit_assert_not_killed" not in sh:
        errors.append("缺 bash 熔断门禁")
    if "after_attempt" not in grammar or "assert_not_killed" not in grammar:
        errors.append("语法付费脚本须接线 after_attempt / assert_not_killed")
    for name, text in (
        ("grammar-stage", gstage),
        ("jp-stage", jstage),
        ("en-stage", estage),
        ("jp-reading", jread),
    ):
        if "vocab_fill_circuit_assert_not_killed" not in text:
            errors.append(f"{name} 入口须检查 KILL 开关")
    if "3 次" not in rule and "三次" not in rule:
        errors.append("规则须写明 3 次熔断")
    if "vocab-fill-circuit-resume" not in rule:
        errors.append("规则须写恢复命令")
    if "原因" not in rule and "history" not in rule:
        errors.append("规则须写明记录每次失败原因")

    if errors:
        print("check_vocab_fill_circuit_breaker: FAIL", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print("check_vocab_fill_circuit_breaker: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
