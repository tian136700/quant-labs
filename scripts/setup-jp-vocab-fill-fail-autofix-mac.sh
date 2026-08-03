#!/bin/bash
# 安装：日语补全失败 → 空闲 10 分钟后 Cursor SDK 自动修
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill-fail-autofix.env"
LOG_DIR="${HOME}/Library/Logs"
UID_NUM="$(id -u)"
LABEL="com.infoquests.jp-vocab-fill-fail-autofix"
VENV="${CONFIG_DIR}/cursor-sdk-venv"

mkdir -p "$CONFIG_DIR" "$LOG_DIR"
chmod +x "$ROOT/scripts/jp-vocab-fill-fail-autofix.sh"
chmod +x "$ROOT/scripts/jp-vocab-fill-fail-autofix.py"
chmod +x "$ROOT/.cursor/hooks/cursor-agent-idle-track.py" 2>/dev/null || true

if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<'EOF'
# 日语补全失败自动修（Cursor SDK）
# API Key：https://cursor.com/dashboard/integrations
# CURSOR_API_KEY=cursor_...

# 用户 stop 后再等多久才启动后台 Agent（秒，默认 600=10 分钟）
JP_VOCAB_FILL_FAIL_AUTOFIX_IDLE_SECONDS=600

# 模型（须账号有权使用）
CURSOR_SDK_MODEL=composer-2.5

# 1=整条停（也可用 PAUSE.switch）
# JP_VOCAB_FILL_FAIL_AUTOFIX_DISABLED=0
EOF
  echo "已创建配置: $ENV_FILE （请填入 CURSOR_API_KEY）"
else
  echo "配置已存在: $ENV_FILE"
fi

# 确保 cursor-sdk venv
if [[ ! -x "${VENV}/bin/python" ]]; then
  echo "创建 cursor-sdk venv: $VENV"
  python3 -m venv "$VENV"
  "${VENV}/bin/pip" install -U pip -q
  "${VENV}/bin/pip" install 'cursor-sdk' -q
fi
"${VENV}/bin/python" -c "from cursor_sdk import Agent; print('cursor-sdk OK')"

plist_dst="${HOME}/Library/LaunchAgents/${LABEL}.plist"
sed -e "s|__REPO_ROOT__|${ROOT}|g" \
  "$ROOT/scripts/com.infoquests.jp-vocab-fill-fail-autofix.plist.example" > "$plist_dst"

PAUSE_SWITCH="${CONFIG_DIR}/jp-vocab-fill-fail-autofix-PAUSE.switch"
launchctl bootout "gui/${UID_NUM}" "$plist_dst" 2>/dev/null || true
if [[ -f "$PAUSE_SWITCH" ]]; then
  echo "OK: plist 已写，但存在 PAUSE.switch → 未加载 launchd"
  echo "  恢复: rm $PAUSE_SWITCH && bash $ROOT/scripts/setup-jp-vocab-fill-fail-autofix-mac.sh"
else
  launchctl bootstrap "gui/${UID_NUM}" "$plist_dst"
  launchctl enable "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
  echo "OK: ${LABEL}（每 10 分钟；空闲满 10 分钟才启动 SDK）"
fi
echo "  配置: $ENV_FILE"
echo "  暂停: touch $PAUSE_SWITCH"
echo "  日志: ${LOG_DIR}/${LABEL}.log"
echo "  手动扫: bash $ROOT/scripts/jp-vocab-fill-fail-autofix.sh --scan-only"
echo "  干跑:   bash $ROOT/scripts/jp-vocab-fill-fail-autofix.sh --dry-run"
echo "  强制:   bash $ROOT/scripts/jp-vocab-fill-fail-autofix.sh --force --dry-run"
