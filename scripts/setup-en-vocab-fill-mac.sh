#!/bin/bash
# Mac 安装：英语补全拆成 5 个独立 launchd 任务（音标 / 释义 / 词性 / 例句 / 用法）
# 每任务单独占 ollama_slot，跑完即放 —— 勿再绑成一大坨。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/en-vocab-fill.env"
LOG_DIR="${HOME}/Library/Logs"
UID_NUM="$(id -u)"

# 旧「一整包」任务
OLD_COMBINED="com.infoquests.en-vocab-fill"
OLD_READING_ONLY="com.infoquests.en-vocab-fill-reading"

STAGES=(reading meaning pos examples usage)

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

RUN_INTERVAL="${EN_VOCAB_FILL_INTERVAL_SECONDS:-60}"

chmod +x "$ROOT/scripts/en-vocab-fill-stage.sh"
chmod +x "$ROOT/scripts/en-vocab-fill-nightly.sh"
chmod +x "$ROOT/scripts/en-vocab-fill-reading-api.py"
chmod +x "$ROOT/scripts/en-vocab-fill-meaning-api.py"
chmod +x "$ROOT/scripts/en-vocab-fill-example-sentences-api.py"
chmod +x "$ROOT/scripts/en-vocab-fill-usage-api.py"

# 卸掉旧整包 / 旧音标任务
for old in "$OLD_COMBINED" "$OLD_READING_ONLY"; do
  launchctl bootout "gui/${UID_NUM}/${old}" 2>/dev/null || true
  rm -f "${HOME}/Library/LaunchAgents/${old}.plist"
done

for stage in "${STAGES[@]}"; do
  label="com.infoquests.en-vocab-fill-${stage}"
  plist_dst="${HOME}/Library/LaunchAgents/${label}.plist"
  sed \
    -e "s|__REPO_ROOT__|${ROOT}|g" \
    -e "s|__INTERVAL__|${RUN_INTERVAL}|g" \
    -e "s|__STAGE__|${stage}|g" \
    -e "s|__LABEL__|${label}|g" \
    "$ROOT/scripts/com.infoquests.en-vocab-fill-stage.plist.example" > "$plist_dst"
  launchctl bootout "gui/${UID_NUM}/${label}" 2>/dev/null || true
  launchctl bootstrap "gui/${UID_NUM}" "$plist_dst"
  launchctl enable "gui/${UID_NUM}/${label}"
  echo "  installed ${label}"
done

echo ""
echo "OK: 英语补全已拆成 5 个独立任务（各占 ollama_slot，跑完即放）"
echo "  间隔: 每 ${RUN_INTERVAL}s 检测一次；槽忙则 skip，下一分钟再试"
echo "  日志: ${LOG_DIR}/com.infoquests.en-vocab-fill-<stage>.log"
echo "  模型链: gemma4:26b → qwen2.5:14b → qwen2.5:7b（墙钟 600s）"
echo ""
echo "手动单阶段:"
echo "  FORCE=1 bash $ROOT/scripts/en-vocab-fill-stage.sh reading"
echo "  FORCE=1 bash $ROOT/scripts/en-vocab-fill-stage.sh meaning"
echo "  FORCE=1 bash $ROOT/scripts/en-vocab-fill-stage.sh pos"
echo "  FORCE=1 bash $ROOT/scripts/en-vocab-fill-stage.sh examples"
echo "  FORCE=1 bash $ROOT/scripts/en-vocab-fill-stage.sh usage"
echo ""
echo "兼容旧入口（仍可顺序跑五阶段，但每阶段单独占/放槽）:"
echo "  FORCE=1 bash $ROOT/scripts/en-vocab-fill-nightly.sh"
