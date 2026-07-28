#!/bin/bash
# Mac 一次性安装：开课前 Bark 提醒备用（launchd 每 10 分钟；主路径仍是线上 Worker Cron）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.infoquests.schedule-class-bark-remind"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/schedule-class-bark-remind.env"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs"

mkdir -p "$CONFIG_DIR" "$LOG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/scripts/schedule-class-bark-remind.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
else
  echo "保留已有配置: $ENV_FILE"
fi

chmod +x \
  "$ROOT/scripts/schedule-class-bark-remind.sh" \
  "$ROOT/scripts/schedule-class-bark-remind.py"

sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  -e "s|__LOG_DIR__|${LOG_DIR}|g" \
  "$ROOT/scripts/com.infoquests.schedule-class-bark-remind.plist.example" > "$PLIST_DST"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true

echo ""
echo "OK: launchd 已安装（每 10 分钟检查；主提醒请用线上 Worker Cron，本机默认关防双推）"
echo "  plist: $PLIST_DST"
echo "  配置: $ENV_FILE"
echo "  日志: ${LOG_DIR}/schedule-class-bark-remind.log"
echo ""
echo "试跑（不推送）:"
echo "  python3 $ROOT/scripts/schedule-class-bark-remind.py --dry-run --list-upcoming 24"
echo "立刻跑一次正式检查:"
echo "  bash $ROOT/scripts/schedule-class-bark-remind.sh"
echo "临时关闭:"
echo "  在 $ENV_FILE 设 SCHEDULE_CLASS_BARK_REMIND_ENABLED=0"
