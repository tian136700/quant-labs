#!/bin/bash
# Mac 一次性安装：英语词条补全（音标/释义/例句），每 10 分钟 + dirlock
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.infoquests.en-vocab-fill"
OLD_LABEL="com.infoquests.en-vocab-fill-reading"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/en-vocab-fill.env"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs"

mkdir -p "$CONFIG_DIR" "$LOG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/scripts/en-vocab-fill.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
else
  echo "保留已有配置: $ENV_FILE"
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

RUN_INTERVAL="${EN_VOCAB_FILL_INTERVAL_SECONDS:-600}"

chmod +x "$ROOT/scripts/en-vocab-fill-nightly.sh"
chmod +x "$ROOT/scripts/en-vocab-fill-reading-api.py"
chmod +x "$ROOT/scripts/en-vocab-fill-meaning-api.py"
chmod +x "$ROOT/scripts/en-vocab-fill-example-sentences-api.py"

sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  -e "s|__INTERVAL__|${RUN_INTERVAL}|g" \
  "$ROOT/scripts/com.infoquests.en-vocab-fill.plist.example" > "$PLIST_DST"

# 卸掉旧的「每天一次 wrangler 音标」任务，避免叠跑
launchctl bootout "gui/$(id -u)/${OLD_LABEL}" 2>/dev/null || true
rm -f "${HOME}/Library/LaunchAgents/${OLD_LABEL}.plist"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/${LABEL}"

echo ""
echo "OK: launchd 已安装"
echo "  plist: $PLIST_DST"
echo "  每 ${RUN_INTERVAL}s 执行一次（音标→释义/词性→例句；dirlock 防重叠）"
echo "  日志: ${LOG_DIR}/en-vocab-fill.log"
echo "  错误: ${LOG_DIR}/en-vocab-fill.err.log"
echo "  模型: ${EN_VOCAB_FILL_OLLAMA_MODEL:-gemma4:26b}（本机 Ollama）"
echo ""
echo "试跑（不写库）:"
echo "  python3 $ROOT/scripts/en-vocab-fill-reading-api.py --dry-run --limit 5"
echo "  python3 $ROOT/scripts/en-vocab-fill-meaning-api.py --dry-run --limit 3"
echo "立即跑一轮:"
echo "  FORCE=1 bash $ROOT/scripts/en-vocab-fill-nightly.sh"
echo ""
echo "Token 用 ~/.config/info-quests/jp-review-sync.env 里的 JP_REVIEW_UPLOAD_TOKEN"
