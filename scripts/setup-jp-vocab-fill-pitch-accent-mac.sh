#!/bin/bash
# Mac 安装：OJAD 音调补全 launchd（默认每 180 秒，每轮 3 条）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.infoquests.jp-vocab-fill-pitch-accent"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill-pitch-accent.env"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs"

mkdir -p "$CONFIG_DIR" "$LOG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/scripts/jp-vocab-fill-pitch-accent.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

RUN_INTERVAL="${JP_VOCAB_FILL_PITCH_ACCENT_INTERVAL_SECONDS:-180}"

chmod +x "$ROOT/scripts/jp-vocab-fill-pitch-accent-stage.sh"
chmod +x "$ROOT/scripts/jp-vocab-fill-pitch-accent-api.py"

sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  -e "s|__INTERVAL__|${RUN_INTERVAL}|g" \
  "$ROOT/scripts/com.infoquests.jp-vocab-fill-pitch-accent.plist.example" > "$PLIST_DST"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/${LABEL}"

echo ""
echo "OK: OJAD 音调补全 launchd 已安装"
echo "  plist: $PLIST_DST"
echo "  每 ${RUN_INTERVAL}s 执行；每轮 batch=${JP_VOCAB_FILL_PITCH_ACCENT_BATCH:-3}"
echo "  日志: ${LOG_DIR}/jp-vocab-fill-pitch-accent.log"
echo ""
echo "试跑（仅抓 OJAD，不打 API）:"
echo "  python3 $ROOT/scripts/jp-vocab-fill-pitch-accent-api.py --test-words 働く 東京 頭"
echo "试跑（dry-run 同步流程）:"
echo "  python3 $ROOT/scripts/jp-vocab-fill-pitch-accent-api.py --dry-run --batch 3"
echo "立即跑一轮:"
echo "  bash $ROOT/scripts/jp-vocab-fill-pitch-accent-stage.sh"
