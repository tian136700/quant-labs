#!/bin/bash
# Mac 安装：日语 Ollama 补全拆成 3 个独立 launchd 任务（词性 / 释义 / 例句）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill.env"
LOG_DIR="${HOME}/Library/Logs"
UID_NUM="$(id -u)"

OLD_COMBINED="com.stt.jp_vocab_remote_fill_examples"
STAGES=(pos meaning examples)

mkdir -p "$CONFIG_DIR" "$LOG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/scripts/jp-vocab-fill.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
else
  echo "保留已有配置: $ENV_FILE"
fi

chmod +x "$ROOT/scripts/jp-vocab-fill-stage.sh"

RUN_INTERVAL="${JP_VOCAB_FILL_INTERVAL_SECONDS:-60}"

# 卸掉旧「例句+释义」整包任务
launchctl bootout "gui/${UID_NUM}/${OLD_COMBINED}" 2>/dev/null || true
rm -f "${HOME}/Library/LaunchAgents/${OLD_COMBINED}.plist"

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
echo "OK: 日语 Ollama 补全已拆成 3 个独立任务（词性 → 释义 → 例句，各 limit=1）"
echo "  间隔: 每 ${RUN_INTERVAL}s 检测；槽忙则 skip"
echo "  日志: ${LOG_DIR}/com.infoquests.jp-vocab-fill-<stage>.log"
echo "  已卸载旧任务: ${OLD_COMBINED}"
echo ""
echo "手动单阶段:"
echo "  FORCE=1 bash $ROOT/scripts/jp-vocab-fill-stage.sh pos"
echo "  FORCE=1 bash $ROOT/scripts/jp-vocab-fill-stage.sh meaning"
echo "  FORCE=1 bash $ROOT/scripts/jp-vocab-fill-stage.sh examples"
