#!/bin/bash
# 检测是否错过 nightly 补全；若错过则在开盖/登录后补跑（由 launchd 周期性调用）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill-reading.env"
STATE_FILE="${CONFIG_DIR}/jp-vocab-nightly.last_success"
LOCK_DIR="${CONFIG_DIR}/jp-vocab-nightly.lock.d"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

if [[ -d "$LOCK_DIR" ]]; then
  echo "$(date '+%F %T') catchup: nightly already running, skip"
  exit 0
fi

export JP_VOCAB_FILL_READING_HOUR="${JP_VOCAB_FILL_READING_HOUR:-22}"
export JP_VOCAB_FILL_READING_MINUTE="${JP_VOCAB_FILL_READING_MINUTE:-0}"

deadline="$(
  python3 - <<'PY'
from datetime import datetime, timedelta
import os

hour = int(os.environ["JP_VOCAB_FILL_READING_HOUR"])
minute = int(os.environ["JP_VOCAB_FILL_READING_MINUTE"])
now = datetime.now()
slot = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
if now < slot:
    slot -= timedelta(days=1)
print(int(slot.timestamp()))
PY
)"

last_success=0
if [[ -f "$STATE_FILE" ]]; then
  last_success="$(tr -dc '0-9' < "$STATE_FILE" || true)"
  [[ -n "$last_success" ]] || last_success=0
fi

if [[ "$last_success" -ge "$deadline" ]]; then
  echo "$(date '+%F %T') catchup: up to date (last=$last_success deadline=$deadline)"
  exit 0
fi

echo "$(date '+%F %T') catchup: missed slot (last=$last_success deadline=$deadline), running nightly..."
bash "$ROOT/scripts/jp-vocab-nightly.sh"
