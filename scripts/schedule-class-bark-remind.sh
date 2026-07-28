#!/bin/bash
# 开课前 Bark 提醒（本机备用；launchd 每 10 分钟；主路径为线上 Worker Cron）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/schedule-class-bark-remind.env"
LOCK_DIR="${CONFIG_DIR}/schedule-class-bark-remind.lock.d"

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

# 未单独配置时：先读本机共享 Bark，再回退项目 .env.deploy.local
if [[ -z "${BARK_DEVICE_KEY:-}" && -z "${BARK_PUSH_URL:-}" ]]; then
  SYSTEM_BARK_ENV="${HOME}/.config/bark/env"
  if [[ -f "$SYSTEM_BARK_ENV" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$SYSTEM_BARK_ENV"
    set +a
  fi
fi
if [[ -z "${BARK_DEVICE_KEY:-}" && -z "${BARK_PUSH_URL:-}" ]]; then
  DEPLOY_ENV="${ROOT}/.env.deploy.local"
  if [[ -f "$DEPLOY_ENV" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$DEPLOY_ENV"
    set +a
  fi
fi

PYTHON_BIN="${SCHEDULE_CLASS_BARK_REMIND_PYTHON:-python3}"
export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

ENABLED="${SCHEDULE_CLASS_BARK_REMIND_ENABLED:-1}"
if [[ "$ENABLED" == "0" || "$ENABLED" == "false" || "$ENABLED" == "off" ]]; then
  echo "$(date '+%F %T') schedule-class-bark-remind: disabled, skip"
  exit 0
fi

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"
dirlock_acquire "$LOCK_DIR" "schedule-class-bark-remind" \
  "${SCHEDULE_CLASS_BARK_REMIND_LOCK_STALE_SECONDS:-120}"

cd "$ROOT"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "$(date '+%F %T') schedule-class-bark-remind: python not found: $PYTHON_BIN" >&2
  exit 1
fi

exec "$PYTHON_BIN" "$ROOT/scripts/schedule-class-bark-remind.py" "$@"
