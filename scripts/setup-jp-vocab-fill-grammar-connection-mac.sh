#!/bin/bash
# Mac 安装：日语语法「仅接序」补全（默认每 60s 1 条；须先 publish list_missing_connection）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.infoquests.jp-vocab-fill-grammar-connection"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill.env"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs"
UID_NUM="$(id -u)"

mkdir -p "$CONFIG_DIR" "$LOG_DIR"
chmod +x "$ROOT/scripts/jp-vocab-fill-grammar-connection-stage.sh"
chmod +x "$ROOT/scripts/jp-vocab-fill-grammar-connection-api.py"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/scripts/jp-vocab-fill.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
else
  echo "保留已有配置: $ENV_FILE"
fi

RUN_INTERVAL="${JP_VOCAB_FILL_GRAMMAR_CONNECTION_INTERVAL_SECONDS:-60}"
if [[ "$RUN_INTERVAL" -lt 60 ]]; then
  echo "拒绝间隔 ${RUN_INTERVAL}s：接序补全最短 60s" >&2
  exit 1
fi

sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  -e "s|__INTERVAL__|${RUN_INTERVAL}|g" \
  -e "s|__LOG_DIR__|${LOG_DIR}|g" \
  "$ROOT/scripts/com.infoquests.jp-vocab-fill-grammar-connection.plist.example" > "$PLIST_DST"

launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" "$PLIST_DST"
launchctl enable "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true

echo ""
echo "OK: ${LABEL} 已安装"
echo "  间隔: 每 ${RUN_INTERVAL}s 检测（最多补 1 条接序；忙则 skip）"
echo "  日志: ${LOG_DIR}/${LABEL}.log"
echo "  前提: 线上已部署 fill-usage mode=list_missing_connection"
echo "手动试跑:"
echo "  bash $ROOT/scripts/jp-vocab-fill-grammar-connection-stage.sh"
echo "  python3 $ROOT/scripts/jp-vocab-fill-grammar-connection-api.py --status"
