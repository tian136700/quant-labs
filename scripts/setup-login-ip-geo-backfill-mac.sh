#!/bin/bash
# Mac：安装登录 IP 归属地回填定时任务（每 30 秒处理 1 个唯一 IP）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.infoquests.login-ip-geo-backfill"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/login-ip-geo-backfill.env"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs"

mkdir -p "$CONFIG_DIR" "$LOG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/scripts/login-ip-geo-backfill.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
else
  echo "保留已有配置: $ENV_FILE"
fi

chmod +x "$ROOT/scripts/login-ip-geo-backfill.sh"
chmod +x "$ROOT/scripts/login-ip-geo-backfill-api.py"

sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  -e "s|__LOG_DIR__|${LOG_DIR}|g" \
  "$ROOT/scripts/com.infoquests.login-ip-geo-backfill.plist.example" > "$PLIST_DST"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/${LABEL}"

echo ""
echo "OK: launchd 已安装（每 30 秒处理 1 个尚未缓存的唯一登录 IP；同一 IP 只查一次）"
echo "  plist: $PLIST_DST"
echo "  日志: ${LOG_DIR}/login-ip-geo-backfill.log"
echo "  默认 via=remote（本机 ip9 + 写远程 D1）；部署后可在 env 设 LOGIN_IP_GEO_BACKFILL_VIA=api"
echo ""
echo "查看进度:"
echo "  python3 $ROOT/scripts/login-ip-geo-backfill-remote.py --status"
echo "整批重跑（清空登录 IP 缓存后再填）:"
echo "  python3 $ROOT/scripts/login-ip-geo-backfill-remote.py --requeue --loop --interval 30"
echo "立即处理 1 个 IP:"
echo "  bash $ROOT/scripts/login-ip-geo-backfill.sh"
