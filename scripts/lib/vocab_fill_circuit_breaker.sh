#!/bin/bash
# 日语/英语补全熔断：KILL 开关开启时，fill 入口立刻 exit 0（不再调接口）
# shellcheck shell=bash

vocab_fill_circuit_assert_not_killed() {
  local owner="${1:-vocab-fill}"
  local kill_file="${HOME}/.config/info-quests/vocab-fill-KILL.switch"
  if [[ -f "$kill_file" ]]; then
    echo "$(date '+%F %T') ${owner}: vocab-fill KILL switch active — skip all API calls."
    echo "  reason: $(tr '\n' ' ' <"$kill_file" | head -c 300)"
    echo "  resume: bash scripts/vocab-fill-circuit-resume.sh"
    exit 0
  fi
}

# 老师抽查进行中 / 抽完后冷却：日语+英语 fill 一律 skip（FORCE=1 可绕过）
# Python CLI：允许跑 exit 0；quiet/错误 exit 75（或其它非 0）→ 本入口 exit 0
vocab_fill_assert_quiz_gate_ok() {
  local owner="${1:-vocab-fill}"
  local root_dir
  root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  local py="${PYTHON_BIN:-python3}"
  local status=0
  if [[ "${VOCAB_FILL_FORCE:-${FORCE:-0}}" == "1" || "${VOCAB_FILL_QUIZ_GATE_FORCE:-0}" == "1" ]]; then
    echo "$(date '+%F %T') ${owner}: quiz gate FORCE → continue"
    return 0
  fi
  set +e
  "$py" "$root_dir/scripts/lib/vocab_fill_quiz_gate.py" "$owner"
  status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    echo "$(date '+%F %T') ${owner}: quiz gate skip (helper exit ${status})"
    exit 0
  fi
}
