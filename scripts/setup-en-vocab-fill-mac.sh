#!/bin/bash
# Mac 安装：英语补全统一为 1 个 launchd 任务。
# 线上模式一次请求补齐整词；本地模式也由单任务顺序跑各阶段。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/en-vocab-fill.env"
LOG_DIR="${HOME}/Library/Logs"
UID_NUM="$(id -u)"

COMBINED_LABEL="com.infoquests.en-vocab-fill"
OLD_READING_ONLY="com.infoquests.en-vocab-fill-reading"
STAGES=(reading meaning pos usage examples)

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

chmod +x "$ROOT/scripts/en-vocab-fill-stage.sh"
chmod +x "$ROOT/scripts/en-vocab-fill-nightly.sh"
chmod +x "$ROOT/scripts/en-vocab-fill-reading-api.py"
chmod +x "$ROOT/scripts/en-vocab-fill-meaning-api.py"
chmod +x "$ROOT/scripts/en-vocab-fill-example-sentences-api.py"
chmod +x "$ROOT/scripts/en-vocab-fill-usage-api.py"

# 先卸掉旧的单任务 / 旧音标任务 / 五个分阶段任务
for old in "$COMBINED_LABEL" "$OLD_READING_ONLY"; do
  launchctl bootout "gui/${UID_NUM}/${old}" 2>/dev/null || true
  rm -f "${HOME}/Library/LaunchAgents/${old}.plist"
done

for stage in "${STAGES[@]}"; do
  label="com.infoquests.en-vocab-fill-${stage}"
  launchctl bootout "gui/${UID_NUM}/${label}" 2>/dev/null || true
  rm -f "${HOME}/Library/LaunchAgents/${label}.plist"
done

plist_dst="${HOME}/Library/LaunchAgents/${COMBINED_LABEL}.plist"
sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  -e "s|__INTERVAL__|${RUN_INTERVAL}|g" \
  "$ROOT/scripts/com.infoquests.en-vocab-fill.plist.example" > "$plist_dst"
launchctl bootout "gui/${UID_NUM}/${COMBINED_LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" "$plist_dst"
launchctl enable "gui/${UID_NUM}/${COMBINED_LABEL}"

echo ""
echo "OK: 英语补全已切回单任务"
echo "  Label: ${COMBINED_LABEL}"
echo "  间隔: 每 ${RUN_INTERVAL}s 检测一次"
echo "  日志: ${LOG_DIR}/en-vocab-fill.log"
echo "  模型链: gemma4:26b → qwen2.5:14b → qwen2.5:7b（墙钟 600s）"
echo ""
echo "手动单任务:"
echo "  FORCE=1 bash $ROOT/scripts/en-vocab-fill-nightly.sh"
