#!/usr/bin/env python3
"""部署前检查 Cloudflare Worker gzip 体积，避免 build 成功后 push 才被拒绝。"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKER_ENTRY = ROOT / ".open-next" / "worker.js"

# Cloudflare Workers 免费版：脚本 gzip 上限 3 MiB = 3072 KiB
CF_FREE_LIMIT_KIB = 3072
# 项目内阻断阈值（须低于 3072；语法用法/例句补全后实测约 2992，留 ~70 KiB 余量）
DEPLOY_BLOCK_KIB = 3005
WARN_MARGIN_KIB = 80


def run_wrangler_dry_run() -> str:
    if not WORKER_ENTRY.is_file():
        raise RuntimeError(
            f"未找到 {WORKER_ENTRY.relative_to(ROOT)}，请先执行 opennextjs-cloudflare build"
        )
    proc = subprocess.run(
        ["npx", "wrangler", "deploy", "--dry-run"],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    output = "\n".join(part for part in (proc.stdout, proc.stderr) if part)
    if proc.returncode != 0:
        raise RuntimeError(f"wrangler deploy --dry-run 失败:\n{output.strip()}")
    return output


def parse_gzip_kib(output: str) -> float:
    match = re.search(r"gzip:\s*([\d.]+)\s*KiB", output)
    if not match:
        raise RuntimeError("无法在 wrangler 输出中解析 gzip 体积")
    return float(match.group(1))


def main() -> int:
    skip = os.environ.get("SKIP_WORKER_SIZE_CHECK", "").strip().lower()
    if skip in ("1", "true", "yes", "on"):
        print("[worker-size] 已跳过检查（SKIP_WORKER_SIZE_CHECK）", flush=True)
        return 0

    output = run_wrangler_dry_run()
    gzip_kib = parse_gzip_kib(output)
    print(
        f"[worker-size] Worker gzip: {gzip_kib:.2f} KiB（部署阈值 {DEPLOY_BLOCK_KIB} KiB，"
        f"Cloudflare 免费版 {CF_FREE_LIMIT_KIB} KiB）",
        flush=True,
    )

    if gzip_kib > DEPLOY_BLOCK_KIB:
        print(
            f"[worker-size] 错误：超过部署阈值 {DEPLOY_BLOCK_KIB} KiB，已中止部署。",
            file=sys.stderr,
            flush=True,
        )
        print(
            "重依赖必须懒加载，禁止静态 import 进页面入口：\n"
            "  jspdf · recharts · xlsx · pdfjs-dist · docx · mammoth · html2canvas\n"
            "  - 弹窗/图表：next/dynamic(..., { ssr: false })\n"
            "  - 点击导出：await import('@/lib/...-export')\n"
            "  - 参考：JpVocabRefDownloadMenu、ToolDotConverterClient、JpVocabRiskChartModal",
            file=sys.stderr,
            flush=True,
        )
        return 1

    if gzip_kib > DEPLOY_BLOCK_KIB - WARN_MARGIN_KIB:
        print(
            f"[worker-size] 警告：距部署阈值不足 {WARN_MARGIN_KIB} KiB，新增功能请优先懒加载重依赖。",
            flush=True,
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"[worker-size] 错误：{exc}", file=sys.stderr)
        raise SystemExit(1) from exc
