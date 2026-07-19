#!/bin/bash
# 兼容旧入口：转调统一补全（音标+释义+例句）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/scripts/en-vocab-fill-nightly.sh"
