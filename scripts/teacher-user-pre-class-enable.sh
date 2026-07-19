#!/bin/bash
# 开课前 2 小时内：禁用态老师账号自动启用（每 10 分钟；dirlock 防重叠）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/teacher-user-pre-class-enable.env"
STATE_FILE="${CONFIG_DIR}/teacher-user-pre-class-enable.last_success"
LOCK_DIR="${CONFIG_DIR}/teacher-user-pre-class-enable.lock.d"

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

PYTHON_BIN="${TEACHER_USER_PRE_CLASS_ENABLE_PYTHON:-python3}"
export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"
dirlock_acquire "$LOCK_DIR" "teacher-user-pre-class-enable" \
  "${TEACHER_USER_PRE_CLASS_ENABLE_LOCK_STALE_SECONDS:-600}"

cd "$ROOT"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "$(date '+%F %T') teacher-user-pre-class-enable: python not found: $PYTHON_BIN" >&2
  exit 1
fi

echo "$(date '+%F %T') teacher-user-pre-class-enable: calling API..."
if ! "$PYTHON_BIN" "$ROOT/scripts/teacher-user-pre-class-enable-api.py"; then
  echo "$(date '+%F %T') teacher-user-pre-class-enable: FAILED" >&2
  exit 1
fi

date +%s > "$STATE_FILE"
echo "$(date '+%F %T') teacher-user-pre-class-enable: done, state updated"
