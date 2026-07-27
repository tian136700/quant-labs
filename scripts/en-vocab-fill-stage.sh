#!/bin/bash
# 英语词条补全：单阶段入口（音标 / 释义 / 词性 / 用法 / 例句 各自独立）
#
# 一键切换（0=本地 Ollama 分阶段 / 1=线上付费一次补齐）：
#   改 scripts/lib/en_vocab_llm_backend.py 里 EN_VOCAB_FILL_LLM_BACKEND
#   或 ~/.config/info-quests/en-vocab-fill.env → EN_VOCAB_FILL_LLM_BACKEND=0|1
#
# 本地：每阶段自己的 dirlock + ollama_slot。
# 线上：仅 reading 阶段跑 online-batch（一词一次补齐）；其它阶段 skip，避免五任务重复烧钱。
#
# 用法：
#   bash scripts/en-vocab-fill-stage.sh reading|meaning|pos|usage|examples
#   FORCE=1 bash scripts/en-vocab-fill-stage.sh meaning
set -euo pipefail

STAGE="${1:-}"
case "$STAGE" in
  reading|meaning|pos|usage|examples) ;;
  *)
    echo "用法: $0 {reading|meaning|pos|usage|examples}" >&2
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

# 命令行 / launchd 已传入的开关优先，避免被下面 source 的 env 盖掉
_PRESERVE_LLM_BACKEND="${EN_VOCAB_FILL_LLM_BACKEND-}"

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
if [[ -n "${_PRESERVE_LLM_BACKEND}" ]]; then
  export EN_VOCAB_FILL_LLM_BACKEND="${_PRESERVE_LLM_BACKEND}"
fi

PYTHON_BIN="${EN_VOCAB_FILL_PYTHON:-python3}"
LOCK_STALE_SECONDS="${EN_VOCAB_FILL_LOCK_STALE_SECONDS:-3600}"
SUCCESS_STALE_SECONDS="${EN_VOCAB_FILL_SUCCESS_STALE_SECONDS:-7200}"
FORCE_RUN="${EN_VOCAB_FILL_FORCE:-${FORCE:-0}}"
QUIET_START_HOUR="${EN_VOCAB_FILL_QUIET_START_HOUR:-24}"
QUIET_END_HOUR="${EN_VOCAB_FILL_QUIET_END_HOUR:-24}"

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

# shellcheck source=scripts/lib/vocab_fill_circuit_breaker.sh
source "$ROOT/scripts/lib/vocab_fill_circuit_breaker.sh"
vocab_fill_circuit_assert_not_killed "$OWNER"

# 解析 0/1 后端（与 scripts/lib/en_vocab_llm_backend.py 一致）
BACKEND="$("$PYTHON_BIN" -c "
import sys
from pathlib import Path
sys.path.insert(0, str(Path(r'$ROOT') / 'scripts' / 'lib'))
from en_vocab_llm_backend import resolve_en_vocab_llm_backend
print(resolve_en_vocab_llm_backend())
")" || BACKEND=0

HOUR_NOW="$(TZ=Asia/Shanghai date +%H)"
HOUR_NOW=$((10#$HOUR_NOW))
BEIJING_STAMP="$(TZ=Asia/Shanghai date '+%F %T')"
if [[ "$FORCE_RUN" != "1" && "$FORCE_RUN" != "true" ]]; then
  if (( HOUR_NOW >= QUIET_START_HOUR && HOUR_NOW < QUIET_END_HOUR )); then
    echo "$(date '+%F %T') ${OWNER}: Beijing ${BEIJING_STAMP} quiet hours, skip"
    exit 0
  fi
fi

# 线上模式：非 reading 阶段直接跳过（由 reading 统一跑 online-batch）
if [[ "$BACKEND" == "1" && "$STAGE" != "reading" ]]; then
  echo "$(date '+%F %T') ${OWNER}: online backend → skip stage (batch runs via reading)"
  exit 0
fi

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"

# 线上 batch 用独立锁，避免与本地 reading 锁语义混淆但仍防叠跑
if [[ "$BACKEND" == "1" ]]; then
  LOCK_DIR="${CONFIG_DIR}/en-vocab-fill-online.lock.d"
  STATE_FILE="${CONFIG_DIR}/en-vocab-fill-online.last_success"
  OWNER="en-vocab-fill-online"
fi

dirlock_warn_if_success_stale "$STATE_FILE" "$OWNER" "$SUCCESS_STALE_SECONDS"
dirlock_acquire "$LOCK_DIR" "$OWNER" "$LOCK_STALE_SECONDS"

cd "$ROOT"
echo "$(date '+%F %T') ${OWNER}: start Beijing=${BEIJING_STAMP} backend=${BACKEND}"

OLLAMA_SLOT_PY="${HOME}/.config/local-llm/ollama_slot.py"
# 每分钟检测：槽被占则立刻 skip（exit 0），下一分钟再试；勿干等 3600s 占着 dirlock
OLLAMA_SLOT_WAIT="${EN_VOCAB_FILL_OLLAMA_SLOT_WAIT_SEC:-0}"
SLOT_DISABLE="${LOCAL_LLM_OLLAMA_SLOT_DISABLE:-0}"

run_cmd=()
if [[ "$BACKEND" == "1" ]]; then
  run_cmd=("$PYTHON_BIN" "$ROOT/scripts/en-vocab-fill-online-batch-api.py")
else
  case "$STAGE" in
    reading) run_cmd=("$PYTHON_BIN" "$ROOT/scripts/en-vocab-fill-reading-api.py" --allow-skipped) ;;
    meaning) run_cmd=("$PYTHON_BIN" "$ROOT/scripts/en-vocab-fill-meaning-api.py" --field meaning) ;;
    pos) run_cmd=("$PYTHON_BIN" "$ROOT/scripts/en-vocab-fill-meaning-api.py" --field pos) ;;
    examples) run_cmd=("$PYTHON_BIN" "$ROOT/scripts/en-vocab-fill-example-sentences-api.py") ;;
    usage) run_cmd=("$PYTHON_BIN" "$ROOT/scripts/en-vocab-fill-usage-api.py") ;;
  esac
fi

set +e
# 线上付费 API 不占 ollama_slot；本地仍走槽
if [[ "$BACKEND" != "1" && -f "$OLLAMA_SLOT_PY" && "$SLOT_DISABLE" != "1" && "$SLOT_DISABLE" != "true" ]]; then
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
