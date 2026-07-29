#!/bin/bash
# 立刻触发日程 → 网易 CalDAV 同步（供 Telegram 录入 / 手动 kick）
# 通过 touch kick 文件唤醒 launchd WatchPaths；若 launchd 未装则直接跑同步。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
KICK_FILE="${CONFIG_DIR}/schedule-caldav.kick"
LABEL="com.infoquests.schedule-caldav"

mkdir -p "$CONFIG_DIR"
# 内容变化即可触发 WatchPaths（同一秒内多次 touch 也可能合并，无妨）
date +%s >"$KICK_FILE"

if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  # WatchPaths 会拉起同步；再 kickstart 一次防漏
  launchctl kickstart -k "gui/$(id -u)/${LABEL}" 2>/dev/null || true
  echo "$(date '+%F %T') schedule-caldav: kick sent (launchd)"
  exit 0
fi

echo "$(date '+%F %T') schedule-caldav: launchd not loaded, running sync directly"
exec bash "$ROOT/scripts/schedule-caldav-sync.sh"
