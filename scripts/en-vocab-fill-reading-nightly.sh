#!/bin/bash
# 兼容旧入口：只跑音标阶段
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/scripts/en-vocab-fill-stage.sh" reading
