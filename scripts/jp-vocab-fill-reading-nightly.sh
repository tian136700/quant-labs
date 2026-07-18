#!/bin/bash
# launchd 入口：仅补全读音（不要顺带跑 daily-rollover）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill-reading.env"
LOCK_DIR="${CONFIG_DIR}/jp-vocab-fill-reading.lock.d"
STATE_FILE="${CONFIG_DIR}/jp-vocab-fill-reading.last_success"

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

PYTHON_BIN="${JP_VOCAB_FILL_READING_PYTHON:-python3}"
JISHO="${JP_VOCAB_FILL_READING_JISHO:-1}"
JISHO_DELAY_MS="${JP_VOCAB_FILL_READING_JISHO_DELAY_MS:-350}"
# 锁超过该秒数仍未释放 → 视为残留锁并回收（默认 30 分钟）
LOCK_STALE_SECONDS="${JP_VOCAB_FILL_READING_LOCK_STALE_SECONDS:-1800}"
# last_success 超过该秒数未更新 → 打 WARNING（默认 2 小时）
SUCCESS_STALE_SECONDS="${JP_VOCAB_FILL_READING_SUCCESS_STALE_SECONDS:-7200}"

FILL_ARGS=(--allow-skipped "--jisho-delay-ms=$JISHO_DELAY_MS")
if [[ "$JISHO" == "0" || "$JISHO" == "false" || "$JISHO" == "no" ]]; then
  FILL_ARGS+=(--no-jisho)
fi

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

# 与例句/释义补全一致：北京时间 08:00–24:00 静默，00:00–08:00 才跑
# FORCE=1 可强制（手动调试）
QUIET_START_HOUR="${JP_VOCAB_FILL_QUIET_START_HOUR:-8}"
QUIET_END_HOUR="${JP_VOCAB_FILL_QUIET_END_HOUR:-24}"
FORCE_RUN="${JP_VOCAB_FILL_FORCE:-${FORCE:-0}}"
# 强制用北京时间（不受本机时区影响）
HOUR_NOW="$(TZ=Asia/Shanghai date +%H)"
HOUR_NOW=$((10#$HOUR_NOW))
BEIJING_STAMP="$(TZ=Asia/Shanghai date '+%F %T')"
if [[ "$FORCE_RUN" != "1" && "$FORCE_RUN" != "true" ]]; then
  if (( HOUR_NOW >= QUIET_START_HOUR && HOUR_NOW < QUIET_END_HOUR )); then
    echo "$(date '+%F %T') fill-reading: Beijing ${BEIJING_STAMP} quiet hours ${QUIET_START_HOUR}:00–${QUIET_END_HOUR}:00, skip"
    exit 0
  fi
fi
echo "$(date '+%F %T') fill-reading: Beijing ${BEIJING_STAMP} outside quiet hours, continue"

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"

dirlock_warn_if_success_stale "$STATE_FILE" "fill-reading" "$SUCCESS_STALE_SECONDS"
# 不能用 exec：否则 bash 被替换，EXIT trap 不会跑，锁目录会永久残留
dirlock_acquire "$LOCK_DIR" "fill-reading" "$LOCK_STALE_SECONDS"

cd "$ROOT"
echo "$(date '+%F %T') fill-reading: start"
"$PYTHON_BIN" "$ROOT/scripts/jp-vocab-fill-reading-api.py" "${FILL_ARGS[@]}"
status=$?
if [[ "$status" -eq 0 ]]; then
  date +%s > "$STATE_FILE"
  echo "$(date '+%F %T') fill-reading: done"
else
  echo "$(date '+%F %T') fill-reading: FAILED (exit $status)" >&2
fi
exit "$status"
