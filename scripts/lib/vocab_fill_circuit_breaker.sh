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
