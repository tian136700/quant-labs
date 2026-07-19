#!/bin/bash
# 英语词条补全：单阶段入口（音标 / 释义 / 词性 / 例句 各自独立）
#
# 每阶段自己的 dirlock + ollama_slot：跑完即放槽，不把音标+释义+例句绑成一大坨占死模型。
#
# 用法：
#   bash scripts/en-vocab-fill-stage.sh reading|meaning|pos|examples
#   FORCE=1 bash scripts/en-vocab-fill-stage.sh meaning
set -euo pipefail

STAGE="${1:-}"
case "$STAGE" in
  reading|meaning|pos|examples) ;;
  *)
    echo "用法: $0 {reading|meaning|pos|examples}" >&2
    exit 2
    ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/en-vocab-fill.env"
LEGACY_ENV_FILE="${CONFIG_DIR}/en-vocab-fill-reading.env"
LOCK_DIR="${CONFIG_DIR}/en-vocab-fill-${STAGE}.lock.d"
STATE_FILE="${CONFIG_DIR}/en-vocab-fill-${STAGE}.last_success"
OWNER="en-vocab-fill-${STAGE}"

if [[ -f "$REVIEW_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$REVIEW_ENV_FILE"
  set +a
fi
if [[ -f "$LEGACY_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$LEGACY_ENV_FILE"
  set +a
fi
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

PYTHON_BIN="${EN_VOCAB_FILL_PYTHON:-python3}"
LOCK_STALE_SECONDS="${EN_VOCAB_FILL_LOCK_STALE_SECONDS:-3600}"
SUCCESS_STALE_SECONDS="${EN_VOCAB_FILL_SUCCESS_STALE_SECONDS:-7200}"
FORCE_RUN="${EN_VOCAB_FILL_FORCE:-${FORCE:-0}}"
QUIET_START_HOUR="${EN_VOCAB_FILL_QUIET_START_HOUR:-24}"
QUIET_END_HOUR="${EN_VOCAB_FILL_QUIET_END_HOUR:-24}"

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

HOUR_NOW="$(TZ=Asia/Shanghai date +%H)"
HOUR_NOW=$((10#$HOUR_NOW))
BEIJING_STAMP="$(TZ=Asia/Shanghai date '+%F %T')"
if [[ "$FORCE_RUN" != "1" && "$FORCE_RUN" != "true" ]]; then
  if (( HOUR_NOW >= QUIET_START_HOUR && HOUR_NOW < QUIET_END_HOUR )); then
    echo "$(date '+%F %T') ${OWNER}: Beijing ${BEIJING_STAMP} quiet hours, skip"
    exit 0
  fi
fi

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"

dirlock_warn_if_success_stale "$STATE_FILE" "$OWNER" "$SUCCESS_STALE_SECONDS"
dirlock_acquire "$LOCK_DIR" "$OWNER" "$LOCK_STALE_SECONDS"

cd "$ROOT"
echo "$(date '+%F %T') ${OWNER}: start Beijing=${BEIJING_STAMP}"

OLLAMA_SLOT_PY="${HOME}/.config/local-llm/ollama_slot.py"
OLLAMA_SLOT_WAIT="${LOCAL_LLM_OLLAMA_SLOT_WAIT_SEC:-3600}"
SLOT_DISABLE="${LOCAL_LLM_OLLAMA_SLOT_DISABLE:-0}"

run_cmd=()
case "$STAGE" in
  reading) run_cmd=("$PYTHON_BIN" "$ROOT/scripts/en-vocab-fill-reading-api.py" --allow-skipped) ;;
  meaning) run_cmd=("$PYTHON_BIN" "$ROOT/scripts/en-vocab-fill-meaning-api.py" --field meaning) ;;
  pos) run_cmd=("$PYTHON_BIN" "$ROOT/scripts/en-vocab-fill-meaning-api.py" --field pos) ;;
  examples) run_cmd=("$PYTHON_BIN" "$ROOT/scripts/en-vocab-fill-example-sentences-api.py") ;;
esac

set +e
if [[ -f "$OLLAMA_SLOT_PY" && "$SLOT_DISABLE" != "1" && "$SLOT_DISABLE" != "true" ]]; then
  echo "$(date '+%F %T') ${OWNER}: acquire ollama slot (wait up to ${OLLAMA_SLOT_WAIT}s)…"
  python3 "$OLLAMA_SLOT_PY" wrap \
    --owner "$OWNER" \
    --wait-sec "$OLLAMA_SLOT_WAIT" \
    -- \
    "${run_cmd[@]}"
  status=$?
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
