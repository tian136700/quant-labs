#!/bin/bash
# 解除「同一词 3 次未搞定」熔断，并重新加载日语/英语补全 launchd
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH:-/usr/bin:/bin}"
PYTHON_BIN="${VOCAB_FILL_CIRCUIT_PYTHON:-/opt/homebrew/bin/python3}"
if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="$(command -v python3)"
fi
"$PYTHON_BIN" "$ROOT/scripts/lib/vocab_fill_circuit_breaker.py" resume
echo "若某任务仍显示未加载，请重跑对应 setup-*-mac.sh"
