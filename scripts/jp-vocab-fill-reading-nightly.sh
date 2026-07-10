#!/bin/bash
# 兼容旧 launchd 入口：转发到统一定时任务 jp-vocab-nightly.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/scripts/jp-vocab-nightly.sh"
