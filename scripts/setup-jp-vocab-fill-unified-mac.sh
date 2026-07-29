#!/bin/bash
# 安装日语统一补全定时（线上 tokken 一词一次；卸掉旧分阶段任务）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill.env"
LOG_DIR="${HOME}/Library/Logs"
UID_NUM="$(id -u)"
LABEL="com.infoquests.jp-vocab-fill-unified"
# 优先：显式环境变量 → 配置文件已存值 → 默认 180
if [[ -z "${JP_VOCAB_FILL_UNIFIED_INTERVAL_SECONDS:-}" && -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  _iv="$(grep -E '^JP_VOCAB_FILL_UNIFIED_INTERVAL_SECONDS=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  if [[ -n "${_iv}" ]]; then
    JP_VOCAB_FILL_UNIFIED_INTERVAL_SECONDS="${_iv}"
  fi
fi
RUN_INTERVAL="${JP_VOCAB_FILL_UNIFIED_INTERVAL_SECONDS:-180}"

# 旧任务（分阶段 / 独立语法 / 读音 Ollama）
RETIRED=(
  com.infoquests.jp-vocab-fill-pos
  com.infoquests.jp-vocab-fill-examples
  com.infoquests.jp-vocab-fill-reading
  com.infoquests.jp-vocab-fill-grammar
  com.infoquests.jp-vocab-fill-grammar-connection
  com.infoquests.jp-vocab-fill-meaning
  com.stt.jp_vocab_remote_fill_examples
)

mkdir -p "$CONFIG_DIR" "$LOG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/scripts/jp-vocab-fill.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
fi

# 把本次间隔写回 env，供维护中心与下次安装共用
if grep -q '^JP_VOCAB_FILL_UNIFIED_INTERVAL_SECONDS=' "$ENV_FILE" 2>/dev/null; then
  sed -i.bak "s/^JP_VOCAB_FILL_UNIFIED_INTERVAL_SECONDS=.*/JP_VOCAB_FILL_UNIFIED_INTERVAL_SECONDS=${RUN_INTERVAL}/" "$ENV_FILE"
  rm -f "${ENV_FILE}.bak"
else
  echo "JP_VOCAB_FILL_UNIFIED_INTERVAL_SECONDS=${RUN_INTERVAL}" >> "$ENV_FILE"
fi

# 确保线上模式开关
if ! grep -q '^JP_VOCAB_FILL_LLM_BACKEND=' "$ENV_FILE" 2>/dev/null; then
  echo "JP_VOCAB_FILL_LLM_BACKEND=1" >> "$ENV_FILE"
  echo "已写入 JP_VOCAB_FILL_LLM_BACKEND=1"
fi

chmod +x "$ROOT/scripts/jp-vocab-fill-unified-stage.sh"
chmod +x "$ROOT/scripts/jp-vocab-fill-online-batch-api.py"

for old in "${RETIRED[@]}"; do
  launchctl bootout "gui/${UID_NUM}/${old}" 2>/dev/null || true
  rm -f "${HOME}/Library/LaunchAgents/${old}.plist"
  echo "  uninstalled ${old}"
done

plist_dst="${HOME}/Library/LaunchAgents/${LABEL}.plist"
sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  -e "s|__INTERVAL__|${RUN_INTERVAL}|g" \
  "$ROOT/scripts/com.infoquests.jp-vocab-fill-unified.plist.example" > "$plist_dst"

PAUSE_SWITCH="${CONFIG_DIR}/jp-vocab-fill-unified-PAUSE.switch"
launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
if [[ -f "$PAUSE_SWITCH" ]]; then
  echo ""
  echo "OK: 日语统一补全 ${LABEL}（plist 已更新，但维护中心处于「暂停」→ 未加载 launchd）"
  echo "  继续：维护中心「日语补全」点「继续」，或删 ${PAUSE_SWITCH} 后重跑本脚本"
else
  launchctl bootstrap "gui/${UID_NUM}" "$plist_dst"
  launchctl enable "gui/${UID_NUM}/${LABEL}"
  echo ""
  echo "OK: 日语统一补全 ${LABEL}"
fi
echo "  间隔: 每 ${RUN_INTERVAL}s；每轮最多 1 词（tokken）"
echo "  日志: ${LOG_DIR}/com.infoquests.jp-vocab-fill-unified.log"
echo "  开关: ${ENV_FILE} → JP_VOCAB_FILL_LLM_BACKEND=1"
echo ""
echo "手动: FORCE=1 bash $ROOT/scripts/jp-vocab-fill-unified-stage.sh"
echo "调试: python3 $ROOT/scripts/jp-vocab-fill-online-batch-api.py --dry-run"
