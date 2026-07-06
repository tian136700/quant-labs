#!/bin/bash
# 每晚补全 jp_vocab_word 缺失读音（由 launchd 调用，也可手动执行）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill-reading.env"
STATE_FILE="${CONFIG_DIR}/jp-vocab-fill-reading.last_success"
LOCK_DIR="${CONFIG_DIR}/jp-vocab-fill-reading.lock.d"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

TARGET="${JP_VOCAB_FILL_READING_TARGET:-remote}"
JISHO="${JP_VOCAB_FILL_READING_JISHO:-1}"
JISHO_DELAY="${JP_VOCAB_FILL_READING_JISHO_DELAY:-0.35}"

ARGS=(--allow-skipped)
if [[ "$TARGET" == "remote" ]]; then
  ARGS+=(--remote)
elif [[ "$TARGET" == "local" ]]; then
  ARGS+=(--local)
else
  echo "JP_VOCAB_FILL_READING_TARGET must be remote or local (got: $TARGET)" >&2
  exit 1
fi

if [[ "$JISHO" == "1" || "$JISHO" == "true" || "$JISHO" == "yes" ]]; then
  ARGS+=(--jisho "--jisho-delay=$JISHO_DELAY")
fi

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "$(date '+%F %T') nightly: already running, skip"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

cd "$ROOT"
python3 "$ROOT/scripts/migrate-jp-vocab-fill-reading.py" "${ARGS[@]}"
date +%s > "$STATE_FILE"
echo "$(date '+%F %T') nightly: done, state updated"
