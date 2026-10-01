#!/bin/bash
# 兼容旧入口 / 单 launchd：按后端分流
# - 线上(1)：只跑 reading（内部 online-batch 一次补齐），勿再串 meaning…examples
#   （否则每分钟多打 4 次 quiz gate 再 skip，白白争用 Worker）
# - 本地(0)：音标→释义→词性→用法→例句；每阶段独立占/放 ollama_slot
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
ENV_FILE="${CONFIG_DIR}/en-vocab-fill.env"
PYTHON_BIN="${EN_VOCAB_FILL_PYTHON:-python3}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

BACKEND="$("$PYTHON_BIN" -c "
import sys
from pathlib import Path
sys.path.insert(0, str(Path(r'$ROOT') / 'scripts' / 'lib'))
from en_vocab_llm_backend import resolve_en_vocab_llm_backend
print(resolve_en_vocab_llm_backend())
")" || BACKEND=0

if [[ "$BACKEND" == "1" ]]; then
  echo "$(date '+%F %T') en-vocab-fill-nightly: online backend → reading only (full_bundle)"
  exec bash "$ROOT/scripts/en-vocab-fill-stage.sh" reading
fi

echo "$(date '+%F %T') en-vocab-fill-nightly: sequential stages (each releases ollama_slot)"
status=0
for stage in reading meaning pos usage examples; do
  if ! bash "$ROOT/scripts/en-vocab-fill-stage.sh" "$stage"; then
    echo "$(date '+%F %T') en-vocab-fill-nightly: stage=${stage} FAILED" >&2
    status=1
  fi
done
exit "$status"
