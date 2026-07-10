#!/bin/bash
# 每晚补全 jp_vocab_word 缺失读音（由 launchd 调用，也可手动执行）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill-reading.env"
STATE_FILE="${CONFIG_DIR}/jp-vocab-fill-reading.last_success"
LOCK_DIR="${CONFIG_DIR}/jp-vocab-fill-reading.lock.d"
LOCK_WAIT_SECONDS="${JP_VOCAB_FILL_READING_LOCK_WAIT_SECONDS:-0}"

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

JISHO="${JP_VOCAB_FILL_READING_JISHO:-1}"
JISHO_DELAY_MS="${JP_VOCAB_FILL_READING_JISHO_DELAY_MS:-350}"
PYTHON_BIN="${JP_VOCAB_FILL_READING_PYTHON:-python3}"

ARGS=(--allow-skipped)
if [[ "$JISHO" == "0" || "$JISHO" == "false" || "$JISHO" == "no" ]]; then
  ARGS+=(--no-jisho)
fi
ARGS+=("--jisho-delay-ms=$JISHO_DELAY_MS")

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

if [[ "$LOCK_WAIT_SECONDS" =~ ^[0-9]+$ ]] && [[ "$LOCK_WAIT_SECONDS" -gt 0 ]]; then
  echo "$(date '+%F %T') nightly: waiting lock (max ${LOCK_WAIT_SECONDS}s)..."
  waited=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    if [[ "$waited" -ge "$LOCK_WAIT_SECONDS" ]]; then
      echo "$(date '+%F %T') nightly: lock wait timeout after ${LOCK_WAIT_SECONDS}s, skip"
      exit 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
else
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "$(date '+%F %T') nightly: already running, wait disabled, skip"
    exit 0
  fi
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

cd "$ROOT"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "$(date '+%F %T') nightly: python not found: $PYTHON_BIN" >&2
  exit 1
fi

if "$PYTHON_BIN" "$ROOT/scripts/jp-vocab-fill-reading-api.py" "${ARGS[@]}"; then
  date +%s > "$STATE_FILE"
  echo "$(date '+%F %T') nightly: done via API, state updated"
else
  echo "$(date '+%F %T') nightly: FAILED via API (see log above)" >&2
  exit 1
fi
