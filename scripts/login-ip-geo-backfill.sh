#!/bin/bash
# 登录 IP 归属地回填：每次只查 1 个尚未缓存的唯一 IP（ip9），约每 30s 由 launchd 唤醒
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/login-ip-geo-backfill.env"
STATE_FILE="${CONFIG_DIR}/login-ip-geo-backfill.last_success"
LOCK_DIR="${CONFIG_DIR}/login-ip-geo-backfill.lock.d"

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

PYTHON_BIN="${LOGIN_IP_GEO_BACKFILL_PYTHON:-python3}"
export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"
# remote=本机打 ip9 写远程 D1（不依赖 Worker 新路由）；api=POST /ip-geo/backfill
VIA="${LOGIN_IP_GEO_BACKFILL_VIA:-remote}"
MODE="${LOGIN_IP_GEO_BACKFILL_MODE:-step}"

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"
dirlock_acquire "$LOCK_DIR" "login-ip-geo-backfill" \
  "${LOGIN_IP_GEO_BACKFILL_LOCK_STALE_SECONDS:-120}"

cd "$ROOT"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "$(date '+%F %T') login-ip-geo-backfill: python not found: $PYTHON_BIN" >&2
  exit 1
fi

echo "$(date '+%F %T') login-ip-geo-backfill: via=${VIA} mode=${MODE} ..."
if [[ "$VIA" == "api" ]]; then
  if ! "$PYTHON_BIN" "$ROOT/scripts/login-ip-geo-backfill-api.py" --mode "$MODE"; then
    echo "$(date '+%F %T') login-ip-geo-backfill: FAILED" >&2
    exit 1
  fi
else
  if ! "$PYTHON_BIN" "$ROOT/scripts/login-ip-geo-backfill-remote.py" --once; then
    echo "$(date '+%F %T') login-ip-geo-backfill: FAILED" >&2
    exit 1
  fi
fi

date +%s > "$STATE_FILE"
echo "$(date '+%F %T') login-ip-geo-backfill: done"
