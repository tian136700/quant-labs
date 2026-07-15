#!/bin/bash
# Mac：安装日程 → 网易 CalDAV 同步（venv + launchd，默认每 30 分钟）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.infoquests.schedule-caldav"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/schedule-caldav.env"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs"
VENV="${SCRIPTS}/.venv-schedule-caldav"

mkdir -p "$CONFIG_DIR" "$LOG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$SCRIPTS/schedule-caldav.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
  echo "请填写 SCHEDULE_CALDAV_EMAIL 与 SCHEDULE_CALDAV_PASSWORD（授权码）"
else
  echo "保留已有配置: $ENV_FILE"
fi

python3 -m venv "$VENV"
"$VENV/bin/pip" install -r "$SCRIPTS/schedule-caldav-requirements.txt"

chmod +x "$SCRIPTS/schedule-caldav-sync.sh"
chmod +x "$SCRIPTS/schedule-caldav-sync.py"

sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  -e "s|__LOG_DIR__|${LOG_DIR}|g" \
  "$SCRIPTS/com.infoquests.schedule-caldav.plist.example" > "$PLIST_DST"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/${LABEL}"

echo ""
echo "OK: launchd 已安装（每 30 分钟同步一次）"
echo "  plist: $PLIST_DST"
echo "  配置: $ENV_FILE"
echo "  日志: ${LOG_DIR}/schedule-caldav.log"
echo ""
echo "下一步:"
echo "  1. 编辑 $ENV_FILE ，填写邮箱与授权码"
echo "  2. 确认 ~/.config/info-quests/jp-review-sync.env 里有 JP_REVIEW_UPLOAD_TOKEN"
echo "  3. 部署含 /api/admin/schedule-events 的站点后试跑:"
echo "       $VENV/bin/python3 $SCRIPTS/schedule-caldav-sync.py --dry-run"
echo "  4. 正式同步:"
echo "       bash $SCRIPTS/schedule-caldav-sync.sh"
