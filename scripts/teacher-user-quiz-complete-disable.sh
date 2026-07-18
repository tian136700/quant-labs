#!/bin/bash
# 今日抽查完成后延时禁用老师账号（每 15 分钟检查一次）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/teacher-user-quiz-complete-disable.env"
STATE_FILE="${CONFIG_DIR}/teacher-user-quiz-complete-disable.last_success"
LOCK_DIR="${CONFIG_DIR}/teacher-user-quiz-complete-disable.lock.d"

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

PYTHON_BIN="${TEACHER_USER_QUIZ_COMPLETE_DISABLE_PYTHON:-python3}"
export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"
dirlock_acquire "$LOCK_DIR" "teacher-user-quiz-complete-disable" \
  "${TEACHER_USER_QUIZ_COMPLETE_DISABLE_LOCK_STALE_SECONDS:-900}"

cd "$ROOT"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "$(date '+%F %T') teacher-user-quiz-complete-disable: python not found: $PYTHON_BIN" >&2
  exit 1
fi

echo "$(date '+%F %T') teacher-user-quiz-complete-disable: calling API..."
if ! "$PYTHON_BIN" "$ROOT/scripts/teacher-user-quiz-complete-disable-api.py"; then
  echo "$(date '+%F %T') teacher-user-quiz-complete-disable: FAILED" >&2
  exit 1
fi

date +%s > "$STATE_FILE"
echo "$(date '+%F %T') teacher-user-quiz-complete-disable: done, state updated"
