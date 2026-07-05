#!/bin/bash
# 每晚补全 jp_vocab_word 缺失读音（由 launchd 调用，也可手动执行）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${HOME}/.config/info-quests/jp-vocab-fill-reading.env"

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

cd "$ROOT"
exec python3 "$ROOT/scripts/migrate-jp-vocab-fill-reading.py" "${ARGS[@]}"
