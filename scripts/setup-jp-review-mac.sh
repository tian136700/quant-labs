#!/bin/bash
# Mac 端一次性安装：创建虚拟环境并安装 img2pdf（避免 pip 系统保护报错）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$ROOT/.venv-jp-review"

python3 -m venv "$VENV"
"$VENV/bin/pip" install -r "$ROOT/jp-review-requirements.txt"

echo ""
echo "OK: $VENV"
echo "试跑: $VENV/bin/python3 $ROOT/jp-review-sync.py --dry-run"
echo "上传: $VENV/bin/python3 $ROOT/jp-review-sync.py"
