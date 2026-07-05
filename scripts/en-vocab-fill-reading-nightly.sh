#!/bin/bash
# 每晚补全 en_vocab_word 缺失 IPA 音标（由 launchd 调用，也可手动执行）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${HOME}/.config/info-quests/en-vocab-fill-reading.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

TARGET="${EN_VOCAB_FILL_READING_TARGET:-remote}"
DICT_DELAY="${EN_VOCAB_FILL_READING_DICT_DELAY:-0.25}"

ARGS=(--allow-skipped)
if [[ "$TARGET" == "remote" ]]; then
  ARGS+=(--remote)
elif [[ "$TARGET" == "local" ]]; then
  ARGS+=(--local)
else
  echo "EN_VOCAB_FILL_READING_TARGET must be remote or local (got: $TARGET)" >&2
  exit 1
fi

ARGS+=("--dict-delay=$DICT_DELAY")

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"

cd "$ROOT"
exec python3 "$ROOT/scripts/migrate-en-vocab-fill-reading.py" "${ARGS[@]}"
