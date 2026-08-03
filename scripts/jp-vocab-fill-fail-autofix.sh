#!/bin/bash
# 日语补全失败自动修：扫 unresolved → 空闲 10 分钟 → Cursor SDK 后台 Agent
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IQ="${HOME}/.config/info-quests"
ENV_FILE="${IQ}/jp-vocab-fill-fail-autofix.env"
PAUSE="${IQ}/jp-vocab-fill-fail-autofix-PAUSE.switch"

if [[ -f "$PAUSE" ]]; then
  echo "[jp-fill-fail-autofix] paused: $PAUSE"
  exit 0
fi

# shellcheck disable=SC1090
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a
# 统一补全 env（token 等）
if [[ -f "${IQ}/jp-vocab-fill.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${IQ}/jp-vocab-fill.env"
  set +a
fi

# 熔断：与其它 fill 一致
if [[ -f "${IQ}/vocab-fill-KILL.switch" ]]; then
  echo "[jp-fill-fail-autofix] circuit killed → skip"
  exit 0
fi

export PYTHONPATH="${ROOT}/scripts${PYTHONPATH:+:$PYTHONPATH}"
exec python3 "${ROOT}/scripts/jp-vocab-fill-fail-autofix.py" "$@"
