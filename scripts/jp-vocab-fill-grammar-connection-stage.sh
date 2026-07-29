#!/bin/bash
# 日语语法：仅补接序（launchd 每 60s 最多 1 条；忙则跳过）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill.env"
STATE_FILE="${CONFIG_DIR}/jp-vocab-fill-grammar-connection.last_success"
OWNER="jp-vocab-fill-grammar-connection"
SCRIPT="${ROOT}/scripts/jp-vocab-fill-grammar-connection-api.py"

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

export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH:-/usr/bin:/bin}"
export PYTHONUNBUFFERED=1

# shellcheck source=scripts/lib/vocab_fill_circuit_breaker.sh
source "$ROOT/scripts/lib/vocab_fill_circuit_breaker.sh"
vocab_fill_circuit_assert_not_killed "$OWNER"

PYTHON_BIN="${JP_VOCAB_FILL_GRAMMAR_CONNECTION_PYTHON:-/opt/homebrew/bin/python3}"
if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="$(command -v python3)"
fi

cd "$ROOT"
echo "$(date '+%F %T') ${OWNER}: check missing connection (at most 1) py=${PYTHON_BIN}"

set +e
"$PYTHON_BIN" "$SCRIPT" --skip-if-busy
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  date +%s > "$STATE_FILE"
  echo "$(date '+%F %T') ${OWNER}: done"
else
  echo "$(date '+%F %T') ${OWNER}: exit $status" >&2
fi
exit "$status"
