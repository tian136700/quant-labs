#!/bin/bash
# 日语语法：每分钟检测「缺用法或缺例句」→ 成对补最多 1 条（用法+例句同一次付费）
#
# launchd: com.infoquests.jp-vocab-fill-grammar
# 安装: bash scripts/install-jp-vocab-fill-grammar-launchd.sh install
#
# 变形课：只要有例句即算完整（用法应为空），不会反复重补。
# 全量强制重写请用 Agent/手动：--word-id 或 scripts 批清，不要写进本 cron。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${HOME}/.config/info-quests"
REVIEW_ENV_FILE="${CONFIG_DIR}/jp-review-sync.env"
ENV_FILE="${CONFIG_DIR}/jp-vocab-fill.env"
STATE_FILE="${CONFIG_DIR}/jp-vocab-fill-grammar.last_success"
LOCK_DIR="${CONFIG_DIR}/jp-vocab-fill-grammar.cron.lock.d"
OWNER="jp-vocab-fill-grammar-cron"

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
export PYTHONUNBUFFERED=1

# shellcheck source=scripts/lib/dirlock.sh
source "$ROOT/scripts/lib/dirlock.sh"

LOCK_STALE_SECONDS="${JP_VOCAB_FILL_GRAMMAR_CRON_LOCK_STALE_SECONDS:-900}"
dirlock_acquire "$LOCK_DIR" "$OWNER" "$LOCK_STALE_SECONDS"

cd "$ROOT"
echo "$(date '+%F %T') ${OWNER}: start (max 1 missing pair)"

# 只补真正缺失的；无缺失则脚本立刻退出。禁止 --allow-burst / --word-id 清库写进定时。
set +e
python3 "$ROOT/scripts/jp-vocab-fill-grammar-usage-examples-api.py" --max-rounds 1
rc=$?
set -e

if [[ "$rc" -eq 0 ]]; then
  date '+%F %T' >"$STATE_FILE"
  echo "$(date '+%F %T') ${OWNER}: ok"
else
  echo "$(date '+%F %T') ${OWNER}: exit=$rc" >&2
fi

dirlock_release "$LOCK_DIR" "$OWNER" || true
exit "$rc"
