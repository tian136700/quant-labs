#!/bin/bash
# launchd 入口：英语音标 → 释义/词性 → 例句（依次；dirlock 防叠跑）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/en-vocab-fill.env"
LEGACY_ENV_FILE="${CONFIG_DIR}/en-vocab-fill-reading.env"
LOCK_DIR="${CONFIG_DIR}/en-vocab-fill.lock.d"
STATE_FILE="${CONFIG_DIR}/en-vocab-fill.last_success"

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

# 可选静默（默认不静默；英语不像日语有「抽完再等」门禁）
QUIET_START_HOUR="${EN_VOCAB_FILL_QUIET_START_HOUR:-24}"
QUIET_END_HOUR="${EN_VOCAB_FILL_QUIET_END_HOUR:-24}"

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

HOUR_NOW="$(TZ=Asia/Shanghai date +%H)"
HOUR_NOW=$((10#$HOUR_NOW))
BEIJING_STAMP="$(TZ=Asia/Shanghai date '+%F %T')"
if [[ "$FORCE_RUN" != "1" && "$FORCE_RUN" != "true" ]]; then
  if (( HOUR_NOW >= QUIET_START_HOUR && HOUR_NOW < QUIET_END_HOUR )); then
    echo "$(date '+%F %T') en-vocab-fill: Beijing ${BEIJING_STAMP} quiet hours, skip"
    exit 0
  fi
fi

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"

dirlock_warn_if_success_stale "$STATE_FILE" "en-vocab-fill" "$SUCCESS_STALE_SECONDS"
dirlock_acquire "$LOCK_DIR" "en-vocab-fill" "$LOCK_STALE_SECONDS"

DO_READING="${EN_VOCAB_FILL_DO_READING:-1}"
DO_MEANING="${EN_VOCAB_FILL_DO_MEANING:-1}"
DO_EXAMPLES="${EN_VOCAB_FILL_DO_EXAMPLES:-1}"

cd "$ROOT"
echo "$(date '+%F %T') en-vocab-fill: start Beijing=${BEIJING_STAMP}"
status=0

if [[ "$DO_READING" == "1" || "$DO_READING" == "true" ]]; then
  echo "$(date '+%F %T') en-vocab-fill: reading…"
  if ! "$PYTHON_BIN" "$ROOT/scripts/en-vocab-fill-reading-api.py" --allow-skipped; then
    echo "$(date '+%F %T') en-vocab-fill: reading FAILED" >&2
    status=1
  fi
fi

if [[ "$DO_MEANING" == "1" || "$DO_MEANING" == "true" ]]; then
  echo "$(date '+%F %T') en-vocab-fill: meaning+pos…"
  if ! "$PYTHON_BIN" "$ROOT/scripts/en-vocab-fill-meaning-api.py"; then
    echo "$(date '+%F %T') en-vocab-fill: meaning FAILED" >&2
    status=1
  fi
fi

if [[ "$DO_EXAMPLES" == "1" || "$DO_EXAMPLES" == "true" ]]; then
  echo "$(date '+%F %T') en-vocab-fill: examples…"
  if ! "$PYTHON_BIN" "$ROOT/scripts/en-vocab-fill-example-sentences-api.py"; then
    echo "$(date '+%F %T') en-vocab-fill: examples FAILED" >&2
    status=1
  fi
fi

if [[ "$status" -eq 0 ]]; then
  date +%s > "$STATE_FILE"
  echo "$(date '+%F %T') en-vocab-fill: done"
else
  echo "$(date '+%F %T') en-vocab-fill: finished with errors (exit $status)" >&2
fi
exit "$status"
