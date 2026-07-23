#!/bin/bash
# 兼容旧入口：按 音标→释义→词性→用法→例句 顺序跑，但每阶段独立占/放 ollama_slot
# （例句须先有 usage；日常请用 launchd 五任务；本脚本仅手动 FORCE 或旧调用）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "$(date '+%F %T') en-vocab-fill-nightly: sequential stages (each releases ollama_slot)"
status=0
for stage in reading meaning pos usage examples; do
  if ! bash "$ROOT/scripts/en-vocab-fill-stage.sh" "$stage"; then
    echo "$(date '+%F %T') en-vocab-fill-nightly: stage=${stage} FAILED" >&2
    status=1
  fi
done
exit "$status"
