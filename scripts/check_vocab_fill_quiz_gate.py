#!/usr/bin/env python3
"""回归：抽查门禁 30 分钟 + 日英 live + fill 入口接线。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> int:
    errors: list[str] = []

    gate_ts = read("src/lib/jp-vocab-fill-schedule-gate.ts")
    if "30 * 60 * 1000" not in gate_ts and "30 * 60 * 1000" not in gate_ts.replace(" ", ""):
        if "JP_VOCAB_FILL_QUIZ_COOLDOWN_MS = 30" not in gate_ts:
            errors.append("cooldown default must be 30 minutes")
    if "60 * 60 * 1000" in gate_ts and "JP_VOCAB_FILL_QUIZ_COOLDOWN_MS = 60" in gate_ts:
        errors.append("cooldown must not stay at 60 minutes")
    for needle in (
        "getEnVocabTeacherQuizLive",
        "getJpVocabTeacherQuizLive",
        "en_vocab_teacher_quiz_day",
        "jp_vocab_teacher_quiz_day",
        "quiz_in_progress",
        "live_open",
    ):
        if needle not in gate_ts:
            errors.append(f"gate ts missing {needle}")

    route = read("src/app/api/jp-vocab/fill-schedule-gate/route.ts")
    if "默认 30" not in route and "半小时" not in route:
        errors.append("API route comment should say default 30 minutes")

    helper = read("scripts/lib/vocab_fill_quiz_gate.py")
    for needle in (
        "DEFAULT_COOLDOWN_MINUTES = 30",
        "skip_if_quiz_gate_quiet",
        "fill-schedule-gate",
        "return 75",
    ):
        if needle not in helper:
            errors.append(f"quiz gate helper missing {needle}")

    sh = read("scripts/lib/vocab_fill_circuit_breaker.sh")
    if "vocab_fill_assert_quiz_gate_ok" not in sh:
        errors.append("circuit breaker sh missing vocab_fill_assert_quiz_gate_ok")

    stage_files = [
        "scripts/jp-vocab-fill-unified-stage.sh",
        "scripts/en-vocab-fill-stage.sh",
        "scripts/jp-vocab-fill-grammar-stage.sh",
        "scripts/jp-vocab-fill-grammar-connection-stage.sh",
        "scripts/jp-vocab-fill-pos-online-stage.sh",
        "scripts/jp-vocab-fill-frequency-online-stage.sh",
        "scripts/jp-vocab-fill-single-usage-examples-online-stage.sh",
        "scripts/jp-vocab-fill-stage.sh",
        "scripts/jp-vocab-fill-reading-nightly.sh",
    ]
    for rel in stage_files:
        text = read(rel)
        if "vocab_fill_assert_quiz_gate_ok" not in text:
            errors.append(f"{rel} must call vocab_fill_assert_quiz_gate_ok")

    for rel in (
        "scripts/jp-vocab-fill-online-batch-api.py",
        "scripts/en-vocab-fill-online-batch-api.py",
    ):
        text = read(rel)
        if "skip_if_quiz_gate_quiet" not in text:
            errors.append(f"{rel} must call skip_if_quiz_gate_quiet")

    rule = ROOT / ".cursor/rules/vocab-fill-quiz-gate.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/vocab-fill-quiz-gate.mdc")
    else:
        rule_text = rule.read_text(encoding="utf-8")
        if "30 分钟" not in rule_text:
            errors.append("rule must mention 30 分钟")
        if "alwaysApply: true" not in rule_text:
            errors.append("vocab-fill-quiz-gate.mdc must be alwaysApply: true")
        if "1102" not in rule_text:
            errors.append("rule must mention Error 1102")

    hook_files = (
        ".cursor/hooks/vocab-fill-quiz-gate-session.py",
        ".cursor/hooks/remind-vocab-fill-quiz-gate.py",
        ".cursor/hooks/remind-vocab-fill-quiz-gate-after-edit.py",
    )
    for rel in hook_files:
        if not (ROOT / rel).is_file():
            errors.append(f"missing hook {rel}")

    hooks_json = read(".cursor/hooks.json")
    for needle in (
        "vocab-fill-quiz-gate-session.py",
        "remind-vocab-fill-quiz-gate.py",
        "remind-vocab-fill-quiz-gate-after-edit.py",
    ):
        if needle not in hooks_json:
            errors.append(f"hooks.json must wire {needle}")

    # 旧例句规则若仍写 1 小时，提示需对齐（不强制删旧文件）
    old = ROOT / ".cursor/rules/jp-vocab-fill-schedule-gate.mdc"
    if old.is_file():
        old_text = old.read_text(encoding="utf-8")
        if "1 小时" in old_text and "30" not in old_text:
            errors.append(
                "jp-vocab-fill-schedule-gate.mdc still says 1 小时 — update or point to vocab-fill-quiz-gate.mdc"
            )

    if errors:
        print("FAIL:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("OK: vocab fill quiz gate (30min + jp/en live + stage wiring)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
