#!/bin/bash
# launchd 入口：仅补全读音（不要顺带跑 daily-rollover）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill-reading.env"
LOCK_DIR="${CONFIG_DIR}/jp-vocab-fill-reading.lock.d"

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

PYTHON_BIN="${JP_VOCAB_FILL_READING_PYTHON:-python3}"
JISHO="${JP_VOCAB_FILL_READING_JISHO:-1}"
JISHO_DELAY_MS="${JP_VOCAB_FILL_READING_JISHO_DELAY_MS:-350}"

FILL_ARGS=(--allow-skipped "--jisho-delay-ms=$JISHO_DELAY_MS")
if [[ "$JISHO" == "0" || "$JISHO" == "false" || "$JISHO" == "no" ]]; then
  FILL_ARGS+=(--no-jisho)
fi

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "$(date '+%F %T') fill-reading: already running, skip"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

cd "$ROOT"
exec "$PYTHON_BIN" "$ROOT/scripts/jp-vocab-fill-reading-api.py" "${FILL_ARGS[@]}"
