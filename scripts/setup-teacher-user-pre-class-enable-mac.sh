#!/bin/bash
# Mac 端一次性安装：开课前 2 小时自动启用老师账号（launchd，每 10 分钟；dirlock 防重叠）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.infoquests.teacher-user-pre-class-enable"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/teacher-user-pre-class-enable.env"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs"

mkdir -p "$CONFIG_DIR" "$LOG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/scripts/teacher-user-pre-class-enable.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
else
  echo "保留已有配置: $ENV_FILE"
fi

chmod +x "$ROOT/scripts/teacher-user-pre-class-enable.sh"
chmod +x "$ROOT/scripts/teacher-user-pre-class-enable-api.py"

sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  -e "s|__LOG_DIR__|${LOG_DIR}|g" \
  "$ROOT/scripts/com.infoquests.teacher-user-pre-class-enable.plist.example" > "$PLIST_DST"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/${LABEL}"

echo ""
echo "OK: launchd 已安装（每 10 分钟检查；开课前 2 小时内把禁用账号改为可用；dirlock 防重叠）"
echo "  plist: $PLIST_DST"
echo "  日志: ${LOG_DIR}/teacher-user-pre-class-enable.log"
echo ""
echo "试跑（不写库）:"
echo "  python3 $ROOT/scripts/teacher-user-pre-class-enable-api.py --dry-run"
echo "立即跑一次:"
echo "  bash $ROOT/scripts/teacher-user-pre-class-enable.sh"
