#!/bin/bash
# 日语新课板书 Word（含 OJAD 读音）：每分钟预生成
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/jp-lesson-board-docx.env"
LOCK_DIR="${CONFIG_DIR}/jp-lesson-board-docx.lock.d"
STATE_FILE="${CONFIG_DIR}/jp-lesson-board-docx.last_success"
OWNER="jp-lesson-board-docx"
PY="${ROOT}/scripts/.venv-board-docx/bin/python"
if [[ ! -x "$PY" ]]; then
  PY="python3"
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

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

# shellcheck source=scripts/lib/vocab_fill_circuit_breaker.sh
source "$ROOT/scripts/lib/vocab_fill_circuit_breaker.sh"
vocab_fill_circuit_assert_not_killed "$OWNER"
vocab_fill_assert_quiz_gate_ok "$OWNER"

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"
dirlock_acquire "$LOCK_DIR" "$OWNER" \
  "${JP_LESSON_BOARD_DOCX_LOCK_STALE_SECONDS:-900}"

cd "$ROOT"
echo "$(date '+%F %T') ${OWNER}: start"
"$PY" "$ROOT/scripts/jp-lesson-board-docx-api.py" \
  --limit "${JP_LESSON_BOARD_DOCX_LIMIT:-2}"
status=$?
if [[ "$status" -eq 0 ]]; then
  date +%s > "$STATE_FILE"
  echo "$(date '+%F %T') ${OWNER}: done"
else
  echo "$(date '+%F %T') ${OWNER}: FAILED (exit $status)" >&2
fi
exit "$status"
