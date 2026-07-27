#!/bin/bash
# Mac：安装日语抽问跨日清理 launchd（开机 / 合盖补跑漏掉的重置）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.infoquests.jp-vocab-daily-rollover"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill-reading.env"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs"

mkdir -p "$CONFIG_DIR" "$LOG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/scripts/jp-vocab-fill-reading.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
else
  echo "保留已有配置: $ENV_FILE"
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

# 默认 30 分钟醒一次；已成功的北京日会 skip，不打 Worker
RUN_INTERVAL="${JP_VOCAB_DAILY_ROLLOVER_INTERVAL_SECONDS:-1800}"

chmod +x "$ROOT/scripts/jp-vocab-daily-rollover-nightly.sh"
chmod +x "$ROOT/scripts/jp-vocab-daily-rollover-api.py"

sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  -e "s|__INTERVAL__|${RUN_INTERVAL}|g" \
  "$ROOT/scripts/com.infoquests.jp-vocab-daily-rollover.plist.example" >"$PLIST_DST"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/${LABEL}"

echo ""
echo "OK: jp-vocab daily-rollover launchd 已安装"
echo "  plist: $PLIST_DST"
echo "  每 ${RUN_INTERVAL}s 唤醒；RunAtLoad=开机补跑；同北京日已成功则 skip"
echo "  日志: ${LOG_DIR}/jp-vocab-daily-rollover.log"
echo "  错误: ${LOG_DIR}/jp-vocab-daily-rollover.err.log"
echo ""
echo "试跑（不写库）:"
echo "  python3 $ROOT/scripts/jp-vocab-daily-rollover-api.py --dry-run"
echo "立即补跑（写库）:"
echo "  FORCE=1 bash $ROOT/scripts/jp-vocab-daily-rollover-nightly.sh"
