#!/bin/bash
# 临时：线上日语缺词性补全（每分钟 1 条；队列空自动卸 launchd）
#
#   bash scripts/jp-vocab-fill-pos-online-stage.sh
#   FORCE=1 bash scripts/jp-vocab-fill-pos-online-stage.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill.env"
LOCK_DIR="${CONFIG_DIR}/jp-vocab-fill-pos-online.lock.d"
STATE_FILE="${CONFIG_DIR}/jp-vocab-fill-pos-online.last_success"
DONE_PATH="${CONFIG_DIR}/jp-vocab-fill-pos-online-DONE.switch"
OWNER="jp-vocab-fill-pos-online"
LABEL="com.infoquests.jp-vocab-fill-pos-online"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
EXIT_QUEUE_EMPTY=10

if [[ -f "$DONE_PATH" ]]; then
  echo "$(date '+%F %T') ${OWNER}: already DONE, skip"
  exit 0
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
  "${JP_VOCAB_FILL_POS_ONLINE_LOCK_STALE_SECONDS:-3600}"

cd "$ROOT"
echo "$(date '+%F %T') ${OWNER}: start"

set +e
python3 "$ROOT/scripts/jp-vocab-fill-pos-online-api.py"
status=$?
set -e

uninstall_temp_agent() {
  local uid_num
  uid_num="$(id -u)"
  echo "$(date '+%F %T') ${OWNER}: queue empty → uninstall ${LABEL}"
  if [[ -f "$PLIST" ]]; then
    launchctl bootout "gui/${uid_num}" "$PLIST" 2>/dev/null || true
    launchctl bootout "gui/${uid_num}/${LABEL}" 2>/dev/null || true
  fi
}

if [[ "$status" -eq "$EXIT_QUEUE_EMPTY" ]]; then
  date +%s > "$STATE_FILE"
  uninstall_temp_agent
  echo "$(date '+%F %T') ${OWNER}: finished (queue empty, agent removed)"
  exit 0
fi

if [[ "$status" -eq 0 ]]; then
  date +%s > "$STATE_FILE"
  echo "$(date '+%F %T') ${OWNER}: done"
else
  echo "$(date '+%F %T') ${OWNER}: finished with errors (exit $status)" >&2
fi
exit "$status"
