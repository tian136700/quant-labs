#!/bin/bash
# 日语语法：用法+例句缺项检测（每分钟最多补 1 条；串行；忙则跳过）
#
# 硬规则：
#   - 默认只跑「缺用法或缺例句」的下一条（一次付费 1 词）
#   - --skip-if-busy：全量重表或其它进程占锁时本分钟直接退出，绝不排队叠烧
#   - 禁止 --loop / --allow-burst / --refill-ids 写进本入口
#
# 用法：
#   bash scripts/jp-vocab-fill-grammar-stage.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill.env"
STATE_FILE="${CONFIG_DIR}/jp-vocab-fill-grammar.last_success"
OWNER="jp-vocab-fill-grammar"
SCRIPT="${ROOT}/scripts/jp-vocab-fill-grammar-usage-examples-api.py"

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

# 固定 Homebrew Python，避免 launchd 走到 /usr/local 的 Frameworks 3.14（缺 CA → SSL 炸）
PYTHON_BIN="${JP_VOCAB_FILL_GRAMMAR_PYTHON:-/opt/homebrew/bin/python3}"
if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="$(command -v python3)"
fi

cd "$ROOT"
echo "$(date '+%F %T') ${OWNER}: check missing (at most 1) py=${PYTHON_BIN}"

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
