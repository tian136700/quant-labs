#!/bin/bash
# 日语词条补全：单阶段入口（词性 / 例句；释义已退役）
#
# 每阶段自己的 dirlock + ollama_slot：跑完即放槽，不把多阶段绑成一大坨占死模型。
# 实际逻辑在 wq-code/stt（Ollama 生成 + 单条 apply）。
#
# 用法：
#   bash scripts/jp-vocab-fill-stage.sh pos|examples
#   FORCE=1 bash scripts/jp-vocab-fill-stage.sh examples
#
# 释义请用：python3 scripts/jp-vocab-fill-meaning-api.py （tokken，≥1s/条，串行等待；无 launchd）
set -euo pipefail

STAGE="${1:-}"
case "$STAGE" in
  pos|examples) ;;
  meaning)
    echo "释义阶段已停用本机 Ollama。请用: python3 scripts/jp-vocab-fill-meaning-api.py" >&2
    exit 2
    ;;
  *)
    echo "用法: $0 {pos|examples}" >&2
    exit 2
    ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STT_ROOT="${JP_VOCAB_FILL_STT_ROOT:-${HOME}/Documents/code/wq-code/stt}"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill.env"
LOCK_DIR="${CONFIG_DIR}/jp-vocab-fill-${STAGE}.lock.d"
STATE_FILE="${CONFIG_DIR}/jp-vocab-fill-${STAGE}.last_success"
OWNER="jp-vocab-fill-${STAGE}"
STAGE_SCRIPT="${STT_ROOT}/scripts/run_jp_vocab_fill_stage.py"

if [[ ! -f "$STAGE_SCRIPT" ]]; then
  echo "缺少 STT 脚本: $STAGE_SCRIPT" >&2
  exit 1
fi

if [[ -f "$REVIEW_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$REVIEW_ENV_FILE"
  set +a
fi
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

STT_VENV_PY="${STT_ROOT}/.venv/bin/python3"
if [[ -n "${JP_VOCAB_FILL_PYTHON:-}" ]]; then
  PYTHON_BIN="$JP_VOCAB_FILL_PYTHON"
elif [[ -x "$STT_VENV_PY" ]]; then
  PYTHON_BIN="$STT_VENV_PY"
else
  PYTHON_BIN="python3"
fi
LOCK_STALE_SECONDS="${JP_VOCAB_FILL_LOCK_STALE_SECONDS:-3600}"
SUCCESS_STALE_SECONDS="${JP_VOCAB_FILL_SUCCESS_STALE_SECONDS:-7200}"
FORCE_RUN="${JP_VOCAB_FILL_FORCE:-${FORCE:-0}}"

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

# shellcheck source=scripts/lib/vocab_fill_circuit_breaker.sh
source "$ROOT/scripts/lib/vocab_fill_circuit_breaker.sh"
vocab_fill_circuit_assert_not_killed "$OWNER"

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"

dirlock_warn_if_success_stale "$STATE_FILE" "$OWNER" "$SUCCESS_STALE_SECONDS"
dirlock_acquire "$LOCK_DIR" "$OWNER" "$LOCK_STALE_SECONDS"

cd "$ROOT"
echo "$(date '+%F %T') ${OWNER}: start stage=${STAGE}"

OLLAMA_SLOT_PY="${HOME}/.config/local-llm/ollama_slot.py"
OLLAMA_SLOT_WAIT="${JP_VOCAB_FILL_OLLAMA_SLOT_WAIT_SEC:-0}"
SLOT_DISABLE="${LOCAL_LLM_OLLAMA_SLOT_DISABLE:-0}"

run_cmd=("$PYTHON_BIN" "$STAGE_SCRIPT" "$STAGE")
if [[ "$FORCE_RUN" == "1" || "$FORCE_RUN" == "true" ]]; then
  run_cmd+=("--force")
fi

set +e
if [[ -f "$OLLAMA_SLOT_PY" && "$SLOT_DISABLE" != "1" && "$SLOT_DISABLE" != "true" ]]; then
  echo "$(date '+%F %T') ${OWNER}: try ollama slot (wait ${OLLAMA_SLOT_WAIT}s)…"
  python3 "$OLLAMA_SLOT_PY" wrap \
    --owner "$OWNER" \
    --wait-sec "$OLLAMA_SLOT_WAIT" \
    -- \
    "${run_cmd[@]}"
  status=$?
  if [[ "$status" -eq 75 ]]; then
    echo "$(date '+%F %T') ${OWNER}: ollama slot busy, skip (next minute)"
    status=0
  fi
else
  "${run_cmd[@]}"
  status=$?
fi
set -e

if [[ "$status" -eq 0 ]]; then
  date +%s > "$STATE_FILE"
  echo "$(date '+%F %T') ${OWNER}: done"
else
  echo "$(date '+%F %T') ${OWNER}: finished with errors (exit $status)" >&2
fi
exit "$status"
