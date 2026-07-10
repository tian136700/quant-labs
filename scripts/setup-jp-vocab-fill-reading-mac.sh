#!/bin/bash
# Mac 端一次性安装：jp-vocab 统一定时任务（跨日清理 + 读音补全，launchd）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.infoquests.jp-vocab-fill-reading"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill-reading.env"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs"

mkdir -p "$CONFIG_DIR" "$LOG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/scripts/jp-vocab-fill-reading.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
else
  echo "保留已有配置: $ENV_FILE"
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

RUN_INTERVAL="${JP_VOCAB_FILL_READING_INTERVAL_SECONDS:-60}"

chmod +x "$ROOT/scripts/jp-vocab-nightly.sh"
chmod +x "$ROOT/scripts/jp-vocab-fill-reading-nightly.sh"
chmod +x "$ROOT/scripts/jp-vocab-daily-rollover-api.py"

sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  -e "s|__INTERVAL__|${RUN_INTERVAL}|g" \
  "$ROOT/scripts/com.infoquests.jp-vocab-fill-reading.plist.example" > "$PLIST_DST"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
# 卸载旧版 22:00 catchup 任务（已改为每分钟执行，不再需要）
launchctl bootout "gui/$(id -u)/com.infoquests.jp-vocab-fill-reading-catchup" 2>/dev/null || true
rm -f "${HOME}/Library/LaunchAgents/com.infoquests.jp-vocab-fill-reading-catchup.plist"
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/${LABEL}"

echo ""
echo "OK: launchd 已安装"
echo "  nightly plist: $PLIST_DST"
echo "  每 ${RUN_INTERVAL}s 执行一次"
echo "  日志: ${LOG_DIR}/jp-vocab-fill-reading.log"
echo "  错误日志: ${LOG_DIR}/jp-vocab-fill-reading.err.log"
echo ""
echo "若 nightly 日志出现 Operation not permitted："
echo "  系统设置 → 隐私与安全性 → 完全磁盘访问权限 → 添加 /bin/bash"
echo ""
echo "试跑跨日清理（不写库）:"
echo "  python3 $ROOT/scripts/jp-vocab-daily-rollover-api.py --dry-run"
echo "试跑读音补全（不写库）:"
echo "  python3 $ROOT/scripts/jp-vocab-fill-reading-api.py --dry-run"
echo "立即跑一次（跨日清理 + 读音补全）:"
echo "  bash $ROOT/scripts/jp-vocab-nightly.sh"
echo ""
echo "Bearer Token 直接用 ~/.config/info-quests/jp-review-sync.env 里的 JP_REVIEW_UPLOAD_TOKEN（日语教案上传那串，无需另配）"
