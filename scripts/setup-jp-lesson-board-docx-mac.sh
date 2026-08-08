#!/bin/bash
# Mac 安装：日语新课板书 Word（含 OJAD）launchd（默认每 60 秒）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.infoquests.jp-lesson-board-docx"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/jp-lesson-board-docx.env"
PLIST_DST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs"
VENV="${ROOT}/scripts/.venv-board-docx"

mkdir -p "$CONFIG_DIR" "$LOG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/scripts/jp-lesson-board-docx.env.example" "$ENV_FILE"
  echo "已创建配置: $ENV_FILE"
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

RUN_INTERVAL="${JP_LESSON_BOARD_DOCX_INTERVAL_SECONDS:-60}"

# python-docx + Pillow venv（系统 Python 常无写权限）
if [[ ! -x "${VENV}/bin/python" ]]; then
  echo "创建 venv: $VENV"
  python3 -m venv "$VENV"
fi
"${VENV}/bin/pip" install -q --upgrade pip
"${VENV}/bin/pip" install -q python-docx pillow beautifulsoup4 requests

chmod +x "$ROOT/scripts/jp-lesson-board-docx-stage.sh"
chmod +x "$ROOT/scripts/jp-lesson-board-docx-api.py"

sed \
  -e "s|__REPO_ROOT__|${ROOT}|g" \
  -e "s|__INTERVAL__|${RUN_INTERVAL}|g" \
  -e "s|__HOME__|${HOME}|g" \
  "$ROOT/scripts/com.infoquests.jp-lesson-board-docx.plist.example" > "$PLIST_DST"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/${LABEL}"

echo ""
echo "OK: 日语新课板书 Word launchd 已安装"
echo "  plist: $PLIST_DST"
echo "  每 ${RUN_INTERVAL}s；每轮 limit=${JP_LESSON_BOARD_DOCX_LIMIT:-2}"
echo "  日志: ${LOG_DIR}/jp-lesson-board-docx.log"
echo ""
echo "本地 dry-run（fixture）:"
echo "  ${VENV}/bin/python $ROOT/scripts/jp-lesson-board-docx-api.py --fixture-dry-run"
echo "立刻跑一轮:"
echo "  bash $ROOT/scripts/jp-lesson-board-docx-stage.sh"
