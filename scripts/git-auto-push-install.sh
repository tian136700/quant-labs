#!/usr/bin/env bash
# 安装 crontab：改代码 10 分钟无 commit/push 后自动提交、推送，并尝试部署到 Cloudflare
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.infoquests.git-auto-push"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
ONCE="$ROOT/scripts/git-auto-push-once.py"
LOG="$HOME/Library/Logs/git-auto-push.log"
MARKER="# git-auto-push strategy-compare-cloud"
PYTHON="$(command -v python3)"
NPM_BIN="$(dirname "$(command -v npm 2>/dev/null || echo /usr/local/bin/npm)")"
# cron 环境极简，需显式 PATH 才能找到 node/npm/npx
CRON_PATH="/usr/local/bin:/opt/homebrew/bin:${NPM_BIN}:/usr/bin:/bin"

chmod +x "$ROOT/scripts/git-auto-push-once.py" "$ROOT/scripts/git-auto-push-watch.py"

# 移除 launchd（Documents 目录常有 TCC 限制，改用 crontab 更稳）
if [[ -f "$PLIST_DST" ]]; then
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || \
    launchctl unload "$PLIST_DST" 2>/dev/null || true
  rm -f "$PLIST_DST"
fi

mkdir -p "$HOME/Library/Logs"
CRON_LINE="*/1 * * * * PATH=${CRON_PATH} HOME=${HOME} GIT_AUTO_PUSH_DEPLOY=1 ${PYTHON} ${ONCE} >> ${LOG} 2>&1 ${MARKER}"

EXISTING="$(crontab -l 2>/dev/null || true)"
FILTERED="$(printf '%s\n' "$EXISTING" | grep -v 'git-auto-push-once.py' | grep -v "$MARKER" | sed '/^$/d' || true)"
{
  printf '%s\n' "$FILTERED"
  echo "$CRON_LINE"
} | crontab -

echo "[git-auto-push] 已安装 crontab（每分钟检查一次）"
echo "[git-auto-push] 空闲 10 分钟后自动 commit + push + deploy"
echo "[git-auto-push] 提交说明由 git-quick-commit.py 自动猜测（页面优化 / bug修复 等）"
echo "[git-auto-push] 部署凭据（二选一，首次需配置）："
echo "  1) 推荐：cp .env.deploy.local.example .env.deploy.local 并填入 CLOUDFLARE_API_TOKEN"
echo "  2) 或在本机终端执行一次：npx wrangler login"
echo "[git-auto-push] 关闭自动部署：crontab 里把 GIT_AUTO_PUSH_DEPLOY=1 改为 0"
echo "[git-auto-push] 手动提交并部署：npm run commit-push-deploy"
echo "[git-auto-push] 日志：$LOG"
echo "[git-auto-push] 卸载：bash scripts/git-auto-push-uninstall.sh"
