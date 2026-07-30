#!/bin/bash
# 开课前 2 小时内：禁用态老师账号自动启用（每 10 分钟；dirlock 防重叠）
# 失败 Bark（1h 节流）；线上 Worker Cron 每 10 分钟也会打同一 API（不依赖本机）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/teacher-user-pre-class-enable.env"
STATE_FILE="${CONFIG_DIR}/teacher-user-pre-class-enable.last_success"
FAIL_NOTIFY_FILE="${CONFIG_DIR}/teacher-user-pre-class-enable.last_fail_notify"
LOCK_DIR="${CONFIG_DIR}/teacher-user-pre-class-enable.lock.d"
FAIL_NOTIFY_MIN_INTERVAL_SEC="${TEACHER_USER_PRE_CLASS_ENABLE_FAIL_NOTIFY_MIN_SEC:-3600}"

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

notify_pre_class_failure() {
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
    echo "$(date '+%F %T') teacher-user-pre-class-enable: fail Bark skipped (rate-limit ${gap}s)"
    return 0
  fi
  if ! PYTHONPATH="${ROOT}/scripts${PYTHONPATH:+:$PYTHONPATH}" python3 - "$reason" <<'PY'
import sys
reason = (sys.argv[1] if len(sys.argv) > 1 else "启用失败").strip() or "启用失败"
title = "开课前启用老师失败"
body = (
    "开课前自动启用老师账号失败（本机 launchd）。\n"
    f"详情：{reason[:220]}\n"
    "线上 Cron 每 10 分钟也会跑；可："
    "bash scripts/teacher-user-pre-class-enable.sh"
)
try:
    from maintenance_center.bark_notify import send_bark_push
except Exception as exc:
    print(f"teacher-user-pre-class-enable: bark import failed: {exc}", file=sys.stderr)
    sys.exit(0)
result = send_bark_push(
    title=title,
    body=body,
    group="老师开号",
    level="timeSensitive",
    sound="shake",
)
print(
    f"teacher-user-pre-class-enable: bark notify "
    f"ok={result.get('ok')} skipped={result.get('skipped')}"
)
PY
  then
    :
  fi
  echo "$now" >"$FAIL_NOTIFY_FILE"
}

echo "$(date '+%F %T') teacher-user-pre-class-enable: calling API..."
set +e
API_OUT="$("$PYTHON_BIN" "$ROOT/scripts/teacher-user-pre-class-enable-api.py" 2>&1)"
API_RC=$?
set -e
printf '%s\n' "$API_OUT"
if [[ "$API_RC" -ne 0 ]]; then
  echo "$(date '+%F %T') teacher-user-pre-class-enable: FAILED" >&2
  FAIL_ERR="$(printf '%s\n' "$API_OUT" | tail -n 6 | tr '\n' ' ')"
  notify_pre_class_failure "${FAIL_ERR:-api exit $API_RC}"
  exit "$API_RC"
fi

date +%s > "$STATE_FILE"
echo "$(date '+%F %T') teacher-user-pre-class-enable: done, state updated"
