#!/bin/bash
# launchd 入口：日语抽问跨日清理（抽查目标回默认 20 等）
# 关机漏跑后：开机 / 合盖醒来会靠 RunAtLoad + 周期唤醒补跑一次（北京日已成功则 skip）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill-reading.env"
STATE_FILE="${CONFIG_DIR}/jp-vocab-daily-rollover.last_success"
# 兼容旧统一定时任务的成功标记（任一日成功即视为该北京日已跑过）
LEGACY_STATE_FILE="${CONFIG_DIR}/jp-vocab-nightly.last_success"
LOCK_DIR="${CONFIG_DIR}/jp-vocab-daily-rollover.lock.d"
LOCK_STALE_SECONDS="${JP_VOCAB_DAILY_ROLLOVER_LOCK_STALE_SECONDS:-900}"
FORCE_RUN="${JP_VOCAB_DAILY_ROLLOVER_FORCE:-${FORCE:-0}}"

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

PYTHON_BIN="${JP_VOCAB_DAILY_ROLLOVER_PYTHON:-${JP_VOCAB_FILL_READING_PYTHON:-python3}}"
export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"

beijing_today() {
  TZ=Asia/Shanghai date +%F
}

beijing_date_of_unix() {
  local ts="$1"
  if [[ ! "$ts" =~ ^[0-9]+$ ]]; then
    return 1
  fi
  TZ=Asia/Shanghai date -r "$ts" +%F 2>/dev/null || true
}

already_done_beijing_today() {
  local today
  today="$(beijing_today)"
  local ts=""
  if [[ -f "$STATE_FILE" ]]; then
    ts="$(tr -d '[:space:]' <"$STATE_FILE" || true)"
  fi
  if [[ -z "$ts" && -f "$LEGACY_STATE_FILE" ]]; then
    ts="$(tr -d '[:space:]' <"$LEGACY_STATE_FILE" || true)"
  fi
  if [[ -z "$ts" ]]; then
    return 1
  fi
  local done_day
  done_day="$(beijing_date_of_unix "$ts")"
  [[ -n "$done_day" && "$done_day" == "$today" ]]
}

BEIJING_STAMP="$(TZ=Asia/Shanghai date '+%F %T')"
TODAY="$(beijing_today)"

if [[ "$FORCE_RUN" != "1" && "$FORCE_RUN" != "true" ]]; then
  if already_done_beijing_today; then
    echo "$(date '+%F %T') daily-rollover: Beijing ${BEIJING_STAMP} already done for ${TODAY}, skip"
    exit 0
  fi
fi

echo "$(date '+%F %T') daily-rollover: Beijing ${BEIJING_STAMP} catch-up or first run for ${TODAY}"

dirlock_acquire "$LOCK_DIR" "daily-rollover" "$LOCK_STALE_SECONDS"

cd "$ROOT"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "$(date '+%F %T') daily-rollover: python not found: $PYTHON_BIN" >&2
  exit 1
fi

if ! "$PYTHON_BIN" "$ROOT/scripts/jp-vocab-daily-rollover-api.py"; then
  echo "$(date '+%F %T') daily-rollover: FAILED" >&2
  exit 1
fi

date +%s >"$STATE_FILE"
# 同步旧标记，避免 jp-vocab-nightly.sh 误判漏跑
date +%s >"$LEGACY_STATE_FILE"
echo "$(date '+%F %T') daily-rollover: done, state updated for ${TODAY}"
