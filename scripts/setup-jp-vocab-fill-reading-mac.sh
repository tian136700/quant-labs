#!/bin/bash
# Mac 端一次性安装：日语单词读音 nightly 补全（launchd 定时任务）
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

HOUR="${JP_VOCAB_FILL_READING_HOUR:-22}"
MINUTE="${JP_VOCAB_FILL_READING_MINUTE:-0}"

chmod +x "$ROOT/scripts/jp-vocab-fill-reading-nightly.sh"

sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  -e "s|__HOUR__|${HOUR}|g" \
  -e "s|__MINUTE__|${MINUTE}|g" \
  "$ROOT/scripts/com.infoquests.jp-vocab-fill-reading.plist.example" > "$PLIST_DST"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/${LABEL}"
launchctl kickstart -k "gui/$(id -u)/${LABEL}" 2>/dev/null || true

echo ""
echo "OK: launchd 已安装"
echo "  plist: $PLIST_DST"
echo "  每天 ${HOUR}:$(printf '%02d' "$MINUTE") 执行"
echo "  日志: ${LOG_DIR}/jp-vocab-fill-reading.log"
echo ""
echo "试跑（不写库）:"
echo "  python3 $ROOT/scripts/migrate-jp-vocab-fill-reading.py --remote --jisho --dry-run"
echo "立即跑一次:"
echo "  bash $ROOT/scripts/jp-vocab-fill-reading-nightly.sh"
