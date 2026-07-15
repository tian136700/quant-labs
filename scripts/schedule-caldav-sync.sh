#!/bin/bash
# 统一日程 → 网易 CalDAV（iPhone 日历）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/schedule-caldav.env"
STATE_FILE="${CONFIG_DIR}/schedule-caldav.last_success"
LOCK_DIR="${CONFIG_DIR}/schedule-caldav.lock.d"
VENV_PY="${ROOT}/scripts/.venv-schedule-caldav/bin/python3"

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

if [[ -n "${SCHEDULE_CALDAV_PYTHON:-}" ]]; then
  PYTHON_BIN="$SCHEDULE_CALDAV_PYTHON"
elif [[ -x "$VENV_PY" ]]; then
  PYTHON_BIN="$VENV_PY"
else
  PYTHON_BIN="python3"
fi

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"
dirlock_acquire "$LOCK_DIR" "schedule-caldav" \
  "${SCHEDULE_CALDAV_LOCK_STALE_SECONDS:-1800}"

cd "$ROOT"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1 && [[ ! -x "$PYTHON_BIN" ]]; then
  echo "$(date '+%F %T') schedule-caldav: python not found: $PYTHON_BIN" >&2
  exit 1
fi

echo "$(date '+%F %T') schedule-caldav: syncing..."
if ! "$PYTHON_BIN" "$ROOT/scripts/schedule-caldav-sync.py" "$@"; then
  echo "$(date '+%F %T') schedule-caldav: FAILED" >&2
  exit 1
fi

date +%s > "$STATE_FILE"
echo "$(date '+%F %T') schedule-caldav: done, state updated"
