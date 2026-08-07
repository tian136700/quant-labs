#!/bin/bash
# OJAD 音调补全：每分钟抓几条写回线上（仅单词）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill-pitch-accent.env"
LOCK_DIR="${CONFIG_DIR}/jp-vocab-fill-pitch-accent.lock.d"
STATE_FILE="${CONFIG_DIR}/jp-vocab-fill-pitch-accent.last_success"
OWNER="jp-vocab-fill-pitch-accent"

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

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

# shellcheck source=scripts/lib/vocab_fill_circuit_breaker.sh
source "$ROOT/scripts/lib/vocab_fill_circuit_breaker.sh"
vocab_fill_circuit_assert_not_killed "$OWNER"
vocab_fill_assert_quiz_gate_ok "$OWNER"

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"
dirlock_acquire "$LOCK_DIR" "$OWNER" \
  "${JP_VOCAB_FILL_PITCH_ACCENT_LOCK_STALE_SECONDS:-900}"

cd "$ROOT"
echo "$(date '+%F %T') ${OWNER}: start"
python3 "$ROOT/scripts/jp-vocab-fill-pitch-accent-api.py"
status=$?
if [[ "$status" -eq 0 ]]; then
  date +%s > "$STATE_FILE"
  echo "$(date '+%F %T') ${OWNER}: done"
else
  echo "$(date '+%F %T') ${OWNER}: FAILED (exit $status)" >&2
fi
exit "$status"
