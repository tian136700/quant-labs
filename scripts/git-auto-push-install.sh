#!/usr/bin/env bash
# 安装 crontab：改代码 10 分钟无 commit/push 后自动提交并推送
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.infoquests.git-auto-push"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
ONCE="$ROOT/scripts/git-auto-push-once.py"
LOG="$HOME/Library/Logs/git-auto-push.log"
MARKER="# git-auto-push strategy-compare-cloud"
PYTHON="$(command -v python3)"

chmod +x "$ROOT/scripts/git-auto-push-once.py" "$ROOT/scripts/git-auto-push-watch.py"

# 移除 launchd（Documents 目录常有 TCC 限制，改用 crontab 更稳）
if [[ -f "$PLIST_DST" ]]; then
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || \
    launchctl unload "$PLIST_DST" 2>/dev/null || true
  rm -f "$PLIST_DST"
fi

mkdir -p "$HOME/Library/Logs"
CRON_LINE="*/1 * * * * $PYTHON $ONCE >> $LOG 2>&1 $MARKER"

EXISTING="$(crontab -l 2>/dev/null || true)"
FILTERED="$(printf '%s\n' "$EXISTING" | grep -v 'git-auto-push-once.py' | grep -v "$MARKER" | sed '/^$/d' || true)"
{
  printf '%s\n' "$FILTERED"
  echo "$CRON_LINE"
} | crontab -

echo "[git-auto-push] 已安装 crontab（每分钟检查一次）"
echo "[git-auto-push] 空闲 10 分钟后自动 commit + push"
echo "[git-auto-push] 提交说明由 git-quick-commit.py 自动猜测（页面优化 / bug修复 等）"
echo "[git-auto-push] 日志：$LOG"
echo "[git-auto-push] 卸载：bash scripts/git-auto-push-uninstall.sh"
