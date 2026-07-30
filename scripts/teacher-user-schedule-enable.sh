#!/bin/bash
# 北京时间 05:00：今日有课的老师关联账号自动启用
# 05 失败（如 Worker 1102）时，06/07 整点再试；成功后写 last_beijing_date
# 失败会 Bark（节流），避免再像玉老师那样静默没开号
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/teacher-user-schedule-enable.env"
STATE_FILE="${CONFIG_DIR}/teacher-user-schedule-enable.last_success"
LAST_BEIJING_DATE_FILE="${CONFIG_DIR}/teacher-user-schedule-enable.last_beijing_date"
FAIL_NOTIFY_FILE="${CONFIG_DIR}/teacher-user-schedule-enable.last_fail_notify"
LOCK_DIR="${CONFIG_DIR}/teacher-user-schedule-enable.lock.d"
# 30 分钟：05/06/07 各失败一次都能推到
FAIL_NOTIFY_MIN_INTERVAL_SEC="${TEACHER_USER_SCHEDULE_ENABLE_FAIL_NOTIFY_MIN_SEC:-1800}"

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

notify_schedule_enable_failure() {
  local reason="$1"
  local now last gap
  now="$(date +%s)"
  last=0
  if [[ -f "$FAIL_NOTIFY_FILE" ]]; then
    last="$(tr -d '[:space:]' <"$FAIL_NOTIFY_FILE" 2>/dev/null || echo 0)"
  fi
  if [[ "$last" =~ ^[0-9]+$ ]]; then
    gap=$((now - last))
  else
    gap=999999
  fi
  if [[ "$gap" -lt "$FAIL_NOTIFY_MIN_INTERVAL_SEC" ]]; then
    echo "$(date '+%F %T') teacher-user-schedule-enable: fail Bark skipped (rate-limit ${gap}s)"
    return 0
  fi
  if ! PYTHONPATH="${ROOT}/scripts${PYTHONPATH:+:$PYTHONPATH}" python3 - "$reason" "$BEIJING_DATE" "$BEIJING_HOUR" <<'PY'
import sys
reason = (sys.argv[1] if len(sys.argv) > 1 else "启用失败").strip() or "启用失败"
bj_date = sys.argv[2] if len(sys.argv) > 2 else ""
bj_hour = sys.argv[3] if len(sys.argv) > 3 else ""
title = "老师账号早启失败"
body = (
    f"北京 {bj_date} {bj_hour}:xx「今日有课」启用失败。\n"
    f"详情：{reason[:220]}\n"
    "线上 Cron 会在 05/06/07 整点再试；也可："
    "TEACHER_USER_SCHEDULE_ENABLE_FORCE=1 bash scripts/teacher-user-schedule-enable.sh"
)
try:
    from maintenance_center.bark_notify import send_bark_push
except Exception as exc:
    print(f"teacher-user-schedule-enable: bark import failed: {exc}", file=sys.stderr)
    sys.exit(0)
result = send_bark_push(
    title=title,
    body=body,
    group="老师开号",
    level="timeSensitive",
    sound="shake",
)
print(
    f"teacher-user-schedule-enable: bark notify "
    f"ok={result.get('ok')} skipped={result.get('skipped')}"
)
PY
  then
    :
  fi
  echo "$now" >"$FAIL_NOTIFY_FILE"
}

echo "$(date '+%F %T') teacher-user-schedule-enable: calling API..."
set +e
API_OUT="$("$PYTHON_BIN" "$ROOT/scripts/teacher-user-schedule-enable-api.py" 2>&1)"
API_RC=$?
set -e
printf '%s\n' "$API_OUT"
if [[ "$API_RC" -ne 0 ]]; then
  echo "$(date '+%F %T') teacher-user-schedule-enable: FAILED" >&2
  FAIL_ERR="$(printf '%s\n' "$API_OUT" | tail -n 6 | tr '\n' ' ')"
  notify_schedule_enable_failure "${FAIL_ERR:-api exit $API_RC}"
  exit "$API_RC"
fi

date +%s > "$STATE_FILE"
echo "$BEIJING_DATE" > "$LAST_BEIJING_DATE_FILE"
echo "$(date '+%F %T') teacher-user-schedule-enable: done, state updated (Beijing ${BEIJING_DATE})"
