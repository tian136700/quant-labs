#!/bin/bash
# 日语词条补全：统一入口（线上付费 batch 或本地分阶段）
#
# JP_VOCAB_FILL_LLM_BACKEND=1 → jp-vocab-fill-online-batch-api.py（一词一次 tokken）
# JP_VOCAB_FILL_LLM_BACKEND=0 → 跳过（请用旧分阶段 launchd 或 FORCE=1 手动）
#
# launchd：com.infoquests.jp-vocab-fill-unified（每 3 分钟，忙则 skip）
set -euo pipefail

STAGE="${1:-unified}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill.env"
LOCK_DIR="${CONFIG_DIR}/jp-vocab-fill-unified.lock.d"
STATE_FILE="${CONFIG_DIR}/jp-vocab-fill-unified.last_success"
OWNER="jp-vocab-fill-unified"

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

PYTHON_BIN="${JP_VOCAB_FILL_PYTHON:-/opt/homebrew/bin/python3}"
if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="$(command -v python3)"
fi

export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH:-/usr/bin:/bin}"
export PYTHONUNBUFFERED=1

# shellcheck source=scripts/lib/vocab_fill_circuit_breaker.sh
source "$ROOT/scripts/lib/vocab_fill_circuit_breaker.sh"
vocab_fill_circuit_assert_not_killed "$OWNER"
vocab_fill_assert_quiz_gate_ok "$OWNER"

# 维护中心「暂停」：有开关则 exit 0（FORCE=1 手动调试可绕过）
PAUSE_SWITCH="${CONFIG_DIR}/jp-vocab-fill-unified-PAUSE.switch"
FORCE_RUN_EARLY="${JP_VOCAB_FILL_FORCE:-${FORCE:-0}}"
if [[ -f "$PAUSE_SWITCH" && "$FORCE_RUN_EARLY" != "1" ]]; then
  echo "$(date '+%F %T') ${OWNER}: manually paused → skip"
  exit 0
fi

BACKEND="$("$PYTHON_BIN" -c "
import sys
from pathlib import Path
sys.path.insert(0, str(Path(r'$ROOT') / 'scripts' / 'lib'))
from jp_vocab_llm_backend import resolve_jp_vocab_llm_backend
print(resolve_jp_vocab_llm_backend())
")" || BACKEND=0

FORCE_RUN="${JP_VOCAB_FILL_FORCE:-${FORCE:-0}}"

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"

if [[ "$BACKEND" != "1" && "$FORCE_RUN" != "1" ]]; then
  echo "$(date '+%F %T') ${OWNER}: local backend → skip unified online batch"
  exit 0
fi

dirlock_acquire "$LOCK_DIR" "$OWNER" "${JP_VOCAB_FILL_LOCK_STALE_SECONDS:-3600}"

cd "$ROOT"
echo "$(date '+%F %T') ${OWNER}: start backend=${BACKEND} stage=${STAGE}"

set +e
"$PYTHON_BIN" "$ROOT/scripts/jp-vocab-fill-online-batch-api.py"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  date +%s > "$STATE_FILE"
  echo "$(date '+%F %T') ${OWNER}: done"
else
  echo "$(date '+%F %T') ${OWNER}: exit $status" >&2
fi
exit "$status"
