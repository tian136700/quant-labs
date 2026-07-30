#!/bin/bash
# 北京时间 05:00：今日有课的老师关联账号自动启用
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/teacher-user-schedule-enable.env"
STATE_FILE="${CONFIG_DIR}/teacher-user-schedule-enable.last_success"
LAST_BEIJING_DATE_FILE="${CONFIG_DIR}/teacher-user-schedule-enable.last_beijing_date"
LOCK_DIR="${CONFIG_DIR}/teacher-user-schedule-enable.lock.d"

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

PYTHON_BIN="${TEACHER_USER_SCHEDULE_ENABLE_PYTHON:-python3}"
export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

BEIJING_DATE="$(TZ=Asia/Shanghai date +%F)"
BEIJING_HOUR="$(TZ=Asia/Shanghai date +%H)"
FORCE="${TEACHER_USER_SCHEDULE_ENABLE_FORCE:-0}"
# 05 失败（如 Worker 1102）时，06/07 整点再试；成功后写 last_beijing_date，当日不再打
RETRY_HOURS="${TEACHER_USER_SCHEDULE_ENABLE_HOURS:-05 06 07}"

if [[ "$FORCE" != "1" ]]; then
  hour_ok=0
  for h in $RETRY_HOURS; do
    if [[ "$BEIJING_HOUR" == "$h" ]]; then
      hour_ok=1
      break
    fi
  done
  if [[ "$hour_ok" != "1" ]]; then
    echo "$(date '+%F %T') teacher-user-schedule-enable: Beijing ${BEIJING_DATE} ${BEIJING_HOUR}:xx, skip (runs at ${RETRY_HOURS} CST)"
    exit 0
  fi
  if [[ -f "$LAST_BEIJING_DATE_FILE" ]] && [[ "$(cat "$LAST_BEIJING_DATE_FILE")" == "$BEIJING_DATE" ]]; then
    echo "$(date '+%F %T') teacher-user-schedule-enable: already ran for Beijing ${BEIJING_DATE}, skip"
    exit 0
  fi
fi

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"
dirlock_acquire "$LOCK_DIR" "teacher-user-schedule-enable" \
  "${TEACHER_USER_SCHEDULE_ENABLE_LOCK_STALE_SECONDS:-1800}"

cd "$ROOT"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "$(date '+%F %T') teacher-user-schedule-enable: python not found: $PYTHON_BIN" >&2
  exit 1
fi

echo "$(date '+%F %T') teacher-user-schedule-enable: calling API..."
if ! "$PYTHON_BIN" "$ROOT/scripts/teacher-user-schedule-enable-api.py"; then
  echo "$(date '+%F %T') teacher-user-schedule-enable: FAILED" >&2
  exit 1
fi

date +%s > "$STATE_FILE"
echo "$BEIJING_DATE" > "$LAST_BEIJING_DATE_FILE"
echo "$(date '+%F %T') teacher-user-schedule-enable: done, state updated (Beijing ${BEIJING_DATE})"
