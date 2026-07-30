#!/bin/bash
# Mac 端一次性安装：北京时间 05:00 自动启用今日有课的老师账号（launchd）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.infoquests.teacher-user-schedule-enable"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/teacher-user-schedule-enable.env"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs"

mkdir -p "$CONFIG_DIR" "$LOG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/scripts/teacher-user-schedule-enable.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
else
  echo "保留已有配置: $ENV_FILE"
fi

chmod +x "$ROOT/scripts/teacher-user-schedule-enable.sh"
chmod +x "$ROOT/scripts/teacher-user-schedule-enable-api.py"

sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  -e "s|__LOG_DIR__|${LOG_DIR}|g" \
  "$ROOT/scripts/com.infoquests.teacher-user-schedule-enable.plist.example" > "$PLIST_DST"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/${LABEL}"

echo ""
echo "OK: launchd 已安装（每小时检查；北京 05/06/07 启用今日有课老师；与 Mac 本地时区无关）"
echo "  plist: $PLIST_DST"
echo "  日志: ${LOG_DIR}/teacher-user-schedule-enable.log"
echo ""
echo "试跑（不写库）:"
echo "  python3 $ROOT/scripts/teacher-user-schedule-enable-api.py --dry-run"
echo "立即跑一次（忽略北京时间窗口）:"
echo "  TEACHER_USER_SCHEDULE_ENABLE_FORCE=1 bash $ROOT/scripts/teacher-user-schedule-enable.sh"

# 必须联装开课前 2h：05:00 若 1102/漏跑，下午课仍靠 pre-class 开号
echo ""
echo "联装开课前启用（必装，勿跳过）…"
bash "$ROOT/scripts/setup-teacher-user-pre-class-enable-mac.sh"
