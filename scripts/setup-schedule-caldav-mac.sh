#!/bin/bash
# Mac：网易 CalDAV 同步（已弃用，默认禁用；请改用 ICS 订阅到系统日历）
set -euo pipefail

LABEL="com.infoquests.schedule-caldav"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/schedule-caldav.env"
SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"

echo "注意：网易 CalDAV 已停用，推荐使用系统日历 ICS 订阅："
echo "  见 ~/.config/info-quests/schedule-ics-subscribe-url.txt"
echo ""

mkdir -p "$CONFIG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$SCRIPTS/schedule-caldav.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
else
  echo "保留已有配置: $ENV_FILE"
fi

if ! grep -q '^SCHEDULE_CALDAV_DISABLED=' "$ENV_FILE"; then
  printf '\nSCHEDULE_CALDAV_DISABLED=1\n' >> "$ENV_FILE"
else
  # shellcheck disable=SC2016
  perl -i -pe 's/^SCHEDULE_CALDAV_DISABLED=.*/SCHEDULE_CALDAV_DISABLED=1/' "$ENV_FILE"
fi

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
rm -f "$PLIST_DST"

echo "OK: 已停用网易 CalDAV（不安装 launchd）。请用 iPhone/Mac 订阅 ICS。"
