#!/bin/bash
# 安装「临时」日语口语/考试频率补全：每分钟 1 条，队列空自动卸掉。
#
#   bash scripts/setup-jp-vocab-fill-frequency-online-mac.sh
#   FORCE=1 bash scripts/setup-jp-vocab-fill-frequency-online-mac.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
LOG_DIR="${HOME}/Library/Logs"
UID_NUM="$(id -u)"
LABEL="com.infoquests.jp-vocab-fill-frequency-online"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
DONE_PATH="${CONFIG_DIR}/jp-vocab-fill-frequency-online-DONE.switch"
EXAMPLE="$ROOT/scripts/com.infoquests.jp-vocab-fill-frequency-online.plist.example"
INTERVAL="${JP_VOCAB_FILL_FREQUENCY_INTERVAL_SECONDS:-180}"

mkdir -p "$CONFIG_DIR" "$LOG_DIR" "${HOME}/Library/LaunchAgents"

chmod +x "$ROOT/scripts/jp-vocab-fill-frequency-online-stage.sh"
chmod +x "$ROOT/scripts/jp-vocab-fill-frequency-online-api.py"

if [[ "${FORCE:-0}" == "1" || "${FORCE:-0}" == "true" ]]; then
  rm -f "$DONE_PATH"
  echo "已清除 DONE 标记，允许重新跑临时任务"
fi

if [[ -f "$DONE_PATH" ]]; then
  echo "检测到 $DONE_PATH — 上次已跑完口语/考试频率队列。"
  echo "若要重跑：FORCE=1 bash $0"
  exit 0
fi

sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  "$EXAMPLE" > "$PLIST_DST"

/usr/bin/plutil -replace StartInterval -integer "$INTERVAL" "$PLIST_DST" 2>/dev/null || true
/usr/bin/plutil -replace ThrottleInterval -integer "$INTERVAL" "$PLIST_DST" 2>/dev/null || true

launchctl bootout "gui/${UID_NUM}" "$PLIST_DST" 2>/dev/null || true
launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
sleep 0.3
launchctl bootstrap "gui/${UID_NUM}" "$PLIST_DST"
launchctl enable "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl kickstart -k "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true

echo "已安装临时任务: ${LABEL}"
echo "  间隔: 每 ${INTERVAL}s 一条"
echo "  日志: ${LOG_DIR}/${LABEL}.log"
echo "  队列空后会自动 bootout；维护中心「定时任务管理」可见"
echo "  手工试跑 2 条: MAX_ROUNDS=2 bash $ROOT/scripts/jp-vocab-fill-frequency-online-stage.sh"
