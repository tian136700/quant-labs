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

if [[ "$FORCE" != "1" ]]; then
  if [[ "$BEIJING_HOUR" != "05" ]]; then
    echo "$(date '+%F %T') teacher-user-schedule-enable: Beijing ${BEIJING_DATE} ${BEIJING_HOUR}:xx, skip (runs at 05:xx CST)"
    exit 0
  fi
  if [[ -f "$LAST_BEIJING_DATE_FILE" ]] && [[ "$(cat "$LAST_BEIJING_DATE_FILE")" == "$BEIJING_DATE" ]]; then
    echo "$(date '+%F %T') teacher-user-schedule-enable: already ran for Beijing ${BEIJING_DATE}, skip"
    exit 0
  fi
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "$(date '+%F %T') teacher-user-schedule-enable: already running, skip"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

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
