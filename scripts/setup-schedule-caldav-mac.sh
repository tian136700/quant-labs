#!/bin/bash
# Mac：统一日程 → 网易 CalDAV（iPhone 已绑定该邮箱日历即可看到）
# 与 ICS 订阅可并存；iPhone 靠网易日历账号同步时以本任务为准。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.infoquests.schedule-caldav"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/schedule-caldav.env"
KICK_FILE="${CONFIG_DIR}/schedule-caldav.kick"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs"

mkdir -p "$CONFIG_DIR" "$LOG_DIR"
# WatchPaths 目标文件必须存在
if [[ ! -f "$KICK_FILE" ]]; then
  date +%s >"$KICK_FILE"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/scripts/schedule-caldav.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
  echo "请填写 SCHEDULE_CALDAV_EMAIL / SCHEDULE_CALDAV_PASSWORD（授权码）后再跑同步。"
else
  echo "保留已有配置: $ENV_FILE"
fi

# 恢复启用（勿再默认写成 DISABLED=1，否则 iPhone 网易日历会停更）
if grep -q '^SCHEDULE_CALDAV_DISABLED=' "$ENV_FILE"; then
  perl -i -pe 's/^SCHEDULE_CALDAV_DISABLED=.*/SCHEDULE_CALDAV_DISABLED=0/' "$ENV_FILE"
else
  printf '\nSCHEDULE_CALDAV_DISABLED=0\n' >> "$ENV_FILE"
fi

chmod +x "$ROOT/scripts/schedule-caldav-sync.sh"
chmod +x "$ROOT/scripts/schedule-caldav-sync.py"
chmod +x "$ROOT/scripts/schedule-caldav-kick.sh"

sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  -e "s|__LOG_DIR__|${LOG_DIR}|g" \
  -e "s|__CONFIG_DIR__|${CONFIG_DIR}|g" \
  "$ROOT/scripts/com.infoquests.schedule-caldav.plist.example" > "$PLIST_DST"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/${LABEL}"

echo ""
echo "OK: launchd 已安装（每 10 分钟 + kick 文件立刻同步到网易日历）"
echo "  plist: $PLIST_DST"
echo "  日志: ${LOG_DIR}/schedule-caldav.log"
echo ""
echo "试跑（不写网易）:"
echo "  $ROOT/scripts/.venv-schedule-caldav/bin/python3 $ROOT/scripts/schedule-caldav-sync.py --dry-run"
echo "立即同步:"
echo "  bash $ROOT/scripts/schedule-caldav-sync.sh"
echo "  bash $ROOT/scripts/schedule-caldav-kick.sh"
echo ""
echo "ICS 订阅（可选，系统日历直订）见: ${CONFIG_DIR}/schedule-ics-subscribe-url.txt"
