#!/bin/bash
# launchd / 手动：先内置词表，再 OpenAI 补剩余例句
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill-example-sentences.env"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"

if [[ -f "$REVIEW_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$REVIEW_ENV_FILE"
  set +a
fi

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"
PYTHON_BIN="${JP_VOCAB_FILL_EXAMPLE_PYTHON:-python3}"

cd "$ROOT"
echo "$(date '+%F %T') fill-example-ai: start"
"$PYTHON_BIN" "$ROOT/scripts/jp-vocab-fill-example-sentences-ai.py" \
  --catalog-first \
  --limit "${JP_VOCAB_FILL_EXAMPLE_AI_LIMIT:-15}" \
  --delay-ms "${JP_VOCAB_FILL_EXAMPLE_AI_DELAY_MS:-800}"
echo "$(date '+%F %T') fill-example-ai: done"
