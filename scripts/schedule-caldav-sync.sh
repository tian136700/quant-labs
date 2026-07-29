#!/bin/bash
# 统一日程 → 网易 CalDAV（iPhone 日历）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/schedule-caldav.env"
STATE_FILE="${CONFIG_DIR}/schedule-caldav.last_success"
LOCK_DIR="${CONFIG_DIR}/schedule-caldav.lock.d"
FAIL_NOTIFY_FILE="${CONFIG_DIR}/schedule-caldav.last_fail_notify"
VENV_PY="${ROOT}/scripts/.venv-schedule-caldav/bin/python3"
# 失败 Bark 最短间隔（秒），避免 Worker 1027 时每 10 分钟狂轰
FAIL_NOTIFY_MIN_INTERVAL_SEC="${SCHEDULE_CALDAV_FAIL_NOTIFY_MIN_INTERVAL_SEC:-3600}"

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

if [[ "${SCHEDULE_CALDAV_DISABLED:-0}" == "1" ]]; then
  echo "$(date '+%F %T') schedule-caldav: DISABLED (use iPhone/Mac ICS subscription instead), skip"
  exit 0
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

notify_caldav_failure() {
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
    echo "$(date '+%F %T') schedule-caldav: fail Bark skipped (rate-limit ${gap}s < ${FAIL_NOTIFY_MIN_INTERVAL_SEC}s)"
    return 0
  fi
  if ! PYTHONPATH="${ROOT}/scripts${PYTHONPATH:+:$PYTHONPATH}" python3 - "$reason" <<'PY'
import sys
from pathlib import Path

reason = (sys.argv[1] if len(sys.argv) > 1 else "同步失败").strip() or "同步失败"
# Worker 日配额顶满时 API 会 429/1027，日程整条链路停
if "1027" in reason or "Workers" in reason or "日请求" in reason:
    title = "日程同步失败（配额）"
    body = (
        "Workers 日请求配额可能已满，网站日程暂时推不到网易/iPhone。\n"
        f"详情：{reason[:220]}"
    )
else:
    title = "日程同步失败"
    body = (
        "网站日程未能推到网易日历（iPhone 会停更）。\n"
        f"详情：{reason[:220]}\n"
        "可在 Mac 跑：bash scripts/schedule-caldav-sync.sh"
    )
try:
    from maintenance_center.bark_notify import send_bark_push
except Exception as exc:
    print(f"schedule-caldav: bark import failed: {exc}", file=sys.stderr)
    sys.exit(0)
result = send_bark_push(
    title=title,
    body=body,
    group="日程同步",
    level="timeSensitive",
    sound="shake",
)
print(f"schedule-caldav: bark notify ok={result.get('ok')} skipped={result.get('skipped')}")
PY
  then
    :
  fi
  echo "$now" >"$FAIL_NOTIFY_FILE"
}

echo "$(date '+%F %T') schedule-caldav: syncing..."
SYNC_ERR=""
set +e
SYNC_OUT="$("$PYTHON_BIN" "$ROOT/scripts/schedule-caldav-sync.py" "$@" 2>&1)"
SYNC_RC=$?
set -e
printf '%s\n' "$SYNC_OUT"
if [[ "$SYNC_RC" -ne 0 ]]; then
  echo "$(date '+%F %T') schedule-caldav: FAILED" >&2
  SYNC_ERR="$(printf '%s\n' "$SYNC_OUT" | tail -n 8 | tr '\n' ' ')"
  if printf '%s' "$SYNC_OUT" | grep -q 'Error 1027\|HTTP 429'; then
    SYNC_ERR="Workers Error 1027/429（日请求配额） ${SYNC_ERR}"
  fi
  notify_caldav_failure "${SYNC_ERR:-sync exit $SYNC_RC}"
  exit "$SYNC_RC"
fi

date +%s > "$STATE_FILE"
# 成功后清失败通知冷却，便于下次真失败立刻报警
rm -f "$FAIL_NOTIFY_FILE" 2>/dev/null || true
echo "$(date '+%F %T') schedule-caldav: done, state updated"
