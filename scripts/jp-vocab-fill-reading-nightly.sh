#!/bin/bash
# 每晚补全 jp_vocab_word 缺失读音（由 launchd 调用，也可手动执行）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill-reading.env"
STATE_FILE="${CONFIG_DIR}/jp-vocab-fill-reading.last_success"
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

JISHO="${JP_VOCAB_FILL_READING_JISHO:-1}"
JISHO_DELAY_MS="${JP_VOCAB_FILL_READING_JISHO_DELAY_MS:-350}"

ARGS=(--allow-skipped)
if [[ "$JISHO" == "0" || "$JISHO" == "false" || "$JISHO" == "no" ]]; then
  ARGS+=(--no-jisho)
fi
ARGS+=("--jisho-delay-ms=$JISHO_DELAY_MS")

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "$(date '+%F %T') nightly: already running, skip"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

cd "$ROOT"
if python3 "$ROOT/scripts/jp-vocab-fill-reading-api.py" "${ARGS[@]}"; then
  date +%s > "$STATE_FILE"
  echo "$(date '+%F %T') nightly: done via API, state updated"
else
  echo "$(date '+%F %T') nightly: FAILED via API (see log above)" >&2
  exit 1
fi
