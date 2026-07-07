#!/usr/bin/env bash
set -euo pipefail

LABEL="com.infoquests.publish-console"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [[ -f "$PLIST_DST" ]]; then
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || \
    launchctl unload "$PLIST_DST" 2>/dev/null || true
  rm -f "$PLIST_DST"
  echo "[publish-console] 已移除 launchd 服务"
else
  echo "[publish-console] 未找到已安装的服务"
fi
