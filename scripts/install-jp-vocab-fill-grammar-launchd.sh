#!/bin/bash
# 安装 / 卸载：日语语法缺用法或缺例句 → 每分钟成对补 1 条
#
#   bash scripts/install-jp-vocab-fill-grammar-launchd.sh install
#   bash scripts/install-jp-vocab-fill-grammar-launchd.sh uninstall
#   bash scripts/install-jp-vocab-fill-grammar-launchd.sh status
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.infoquests.jp-vocab-fill-grammar"
PLIST_SRC="$ROOT/scripts/${LABEL}.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/${LABEL}.plist"
CRON_SH="$ROOT/scripts/jp-vocab-fill-grammar-usage-examples-cron.sh"

cmd="${1:-status}"

case "$cmd" in
  install)
    chmod +x "$CRON_SH" "$ROOT/scripts/install-jp-vocab-fill-grammar-launchd.sh"
    mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
    cp "$PLIST_SRC" "$PLIST_DEST"
    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST_DEST"
    launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true
    launchctl kickstart -k "gui/$(id -u)/${LABEL}" 2>/dev/null || true
    echo "installed: $PLIST_DEST (StartInterval=60)"
    echo "logs: ~/Library/Logs/${LABEL}.log"
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
    rm -f "$PLIST_DEST"
    echo "uninstalled: $LABEL"
    ;;
  status)
    echo "plist: $PLIST_DEST"
    if [[ -f "$PLIST_DEST" ]]; then
      echo "installed: yes"
    else
      echo "installed: no"
    fi
    launchctl print "gui/$(id -u)/${LABEL}" 2>/dev/null | head -n 40 || echo "(not loaded)"
    echo "--- log tail ---"
    tail -n 20 "$HOME/Library/Logs/${LABEL}.log" 2>/dev/null || echo "(no log yet)"
    ;;
  *)
    echo "用法: $0 {install|uninstall|status}" >&2
    exit 2
    ;;
esac
