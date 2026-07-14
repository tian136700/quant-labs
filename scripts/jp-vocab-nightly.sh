#!/bin/bash
# jp-vocab 统一定时任务：跨日清理 + 读音补全（由 launchd 调用，也可手动执行）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill-reading.env"
STATE_FILE="${CONFIG_DIR}/jp-vocab-nightly.last_success"
LOCK_DIR="${CONFIG_DIR}/jp-vocab-nightly.lock.d"
LOCK_WAIT_SECONDS="${JP_VOCAB_NIGHTLY_LOCK_WAIT_SECONDS:-${JP_VOCAB_FILL_READING_LOCK_WAIT_SECONDS:-0}}"
LOCK_STALE_SECONDS="${JP_VOCAB_NIGHTLY_LOCK_STALE_SECONDS:-${JP_VOCAB_FILL_READING_LOCK_STALE_SECONDS:-1800}}"

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
PYTHON_BIN="${JP_VOCAB_NIGHTLY_PYTHON:-${JP_VOCAB_FILL_READING_PYTHON:-python3}}"

FILL_ARGS=(--allow-skipped)
if [[ "$JISHO" == "0" || "$JISHO" == "false" || "$JISHO" == "no" ]]; then
  FILL_ARGS+=(--no-jisho)
fi
FILL_ARGS+=("--jisho-delay-ms=$JISHO_DELAY_MS")

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"

if [[ "$LOCK_WAIT_SECONDS" =~ ^[0-9]+$ ]] && [[ "$LOCK_WAIT_SECONDS" -gt 0 ]]; then
  echo "$(date '+%F %T') nightly: waiting lock (max ${LOCK_WAIT_SECONDS}s)..."
  waited=0
  while true; do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      echo $$ >"${LOCK_DIR}/pid"
      date +%s >"${LOCK_DIR}/started_at"
      # shellcheck disable=SC2064
      trap 'rm -f "${LOCK_DIR}/pid" "${LOCK_DIR}/started_at" 2>/dev/null || true; rmdir "${LOCK_DIR}" 2>/dev/null || true' EXIT
      break
    fi
    if dirlock_try_reclaim "$LOCK_DIR" "nightly" "$LOCK_STALE_SECONDS"; then
      continue
    fi
    if [[ "$waited" -ge "$LOCK_WAIT_SECONDS" ]]; then
      echo "$(date '+%F %T') nightly: lock wait timeout after ${LOCK_WAIT_SECONDS}s, skip"
      exit 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
else
  dirlock_acquire "$LOCK_DIR" "nightly" "$LOCK_STALE_SECONDS"
fi

cd "$ROOT"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "$(date '+%F %T') nightly: python not found: $PYTHON_BIN" >&2
  exit 1
fi

echo "$(date '+%F %T') nightly: daily rollover..."
if ! "$PYTHON_BIN" "$ROOT/scripts/jp-vocab-daily-rollover-api.py"; then
  echo "$(date '+%F %T') nightly: daily rollover FAILED" >&2
  exit 1
fi

echo "$(date '+%F %T') nightly: fill reading..."
if ! "$PYTHON_BIN" "$ROOT/scripts/jp-vocab-fill-reading-api.py" "${FILL_ARGS[@]}"; then
  echo "$(date '+%F %T') nightly: fill reading FAILED" >&2
  exit 1
fi

date +%s > "$STATE_FILE"
echo "$(date '+%F %T') nightly: done (rollover + fill-reading), state updated"
