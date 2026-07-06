#!/usr/bin/env bash
set -euo pipefail

LABEL="com.infoquests.git-auto-push"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
MARKER="# git-auto-push strategy-compare-cloud"

if [[ -f "$PLIST_DST" ]]; then
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || \
    launchctl unload "$PLIST_DST" 2>/dev/null || true
  rm -f "$PLIST_DST"
fi

EXISTING="$(crontab -l 2>/dev/null || true)"
if printf '%s\n' "$EXISTING" | grep -q 'git-auto-push-once.py'; then
  printf '%s\n' "$EXISTING" \
    | grep -v 'git-auto-push-once.py' \
    | grep -v "$MARKER" \
    | sed '/^$/d' \
    | crontab -
  echo "[git-auto-push] 已移除 crontab 条目"
else
  echo "[git-auto-push] crontab 中无相关条目"
fi

rm -f /tmp/git-auto-push-strategy-compare-cloud.json
echo "[git-auto-push] 卸载完成"
