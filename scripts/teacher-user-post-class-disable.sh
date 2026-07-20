#!/bin/bash
# 下课 10 分钟后：自动禁用老师账号（每 10 分钟；dirlock 防重叠）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/teacher-user-post-class-disable.env"
STATE_FILE="${CONFIG_DIR}/teacher-user-post-class-disable.last_success"
LOCK_DIR="${CONFIG_DIR}/teacher-user-post-class-disable.lock.d"

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

PYTHON_BIN="${TEACHER_USER_POST_CLASS_DISABLE_PYTHON:-python3}"
export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"
dirlock_acquire "$LOCK_DIR" "teacher-user-post-class-disable" \
  "${TEACHER_USER_POST_CLASS_DISABLE_LOCK_STALE_SECONDS:-600}"

cd "$ROOT"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "$(date '+%F %T') teacher-user-post-class-disable: python not found: $PYTHON_BIN" >&2
  exit 1
fi

echo "$(date '+%F %T') teacher-user-post-class-disable: calling API..."
if ! "$PYTHON_BIN" "$ROOT/scripts/teacher-user-post-class-disable-api.py"; then
  echo "$(date '+%F %T') teacher-user-post-class-disable: FAILED" >&2
  exit 1
fi

date +%s > "$STATE_FILE"
echo "$(date '+%F %T') teacher-user-post-class-disable: done, state updated"
