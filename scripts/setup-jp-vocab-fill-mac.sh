#!/bin/bash
# Mac 安装：日语 Ollama 补全（词性 / 例句）；释义已改 tokken 限流脚本，不再装 launchd
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill.env"
LOG_DIR="${HOME}/Library/Logs"
UID_NUM="$(id -u)"

OLD_COMBINED="com.stt.jp_vocab_remote_fill_examples"
# 释义：停用本机 Ollama 定时（改 tokken Anthropic 限流脚本，勿再装）
RETIRED_MEANING="com.infoquests.jp-vocab-fill-meaning"
STAGES=(pos examples)

mkdir -p "$CONFIG_DIR" "$LOG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/scripts/jp-vocab-fill.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
else
  echo "保留已有配置: $ENV_FILE"
fi

chmod +x "$ROOT/scripts/jp-vocab-fill-stage.sh"

RUN_INTERVAL="${JP_VOCAB_FILL_INTERVAL_SECONDS:-600}"

# 卸掉旧「例句+释义」整包任务
launchctl bootout "gui/${UID_NUM}/${OLD_COMBINED}" 2>/dev/null || true
rm -f "${HOME}/Library/LaunchAgents/${OLD_COMBINED}.plist"

# 卸掉已退役的释义 Ollama 定时
launchctl bootout "gui/${UID_NUM}/${RETIRED_MEANING}" 2>/dev/null || true
rm -f "${HOME}/Library/LaunchAgents/${RETIRED_MEANING}.plist"
echo "  uninstalled ${RETIRED_MEANING} (释义改 tokken，不装 launchd)"

for stage in "${STAGES[@]}"; do
  label="com.infoquests.jp-vocab-fill-${stage}"
  plist_dst="${HOME}/Library/LaunchAgents/${label}.plist"
  sed \
    -e "s|__REPO_ROOT__|${ROOT}|g" \
    -e "s|__INTERVAL__|${RUN_INTERVAL}|g" \
    -e "s|__STAGE__|${stage}|g" \
    -e "s|__LABEL__|${label}|g" \
    "$ROOT/scripts/com.infoquests.jp-vocab-fill-stage.plist.example" > "$plist_dst"
  launchctl bootout "gui/${UID_NUM}/${label}" 2>/dev/null || true
  launchctl bootstrap "gui/${UID_NUM}" "$plist_dst"
  launchctl enable "gui/${UID_NUM}/${label}"
  echo "  installed ${label}"
done

echo ""
echo "OK: 日语 Ollama 补全：词性 + 例句（各 limit=1）；释义定时已卸"
echo "  间隔: 每 ${RUN_INTERVAL}s 检测；槽忙则 skip"
echo "  日志: ${LOG_DIR}/com.infoquests.jp-vocab-fill-<stage>.log"
echo "  释义（tokken Anthropic 限流，无 launchd）:"
echo "    python3 $ROOT/scripts/jp-vocab-fill-meaning-api.py --loop"
echo ""
echo "手动单阶段:"
echo "  FORCE=1 bash $ROOT/scripts/jp-vocab-fill-stage.sh pos"
echo "  FORCE=1 bash $ROOT/scripts/jp-vocab-fill-stage.sh examples"
