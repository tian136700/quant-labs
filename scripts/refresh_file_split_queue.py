#!/usr/bin/env python3
"""Refresh docs/file-split-queue.{json,txt} for business source files over the LOC threshold.

Rule: business code (src/**/*.ts|tsx|js|jsx) should be ≤1000 lines per file.
Styles / i18n messages / compact backups are excluded from the queue.

status:
  0 = still over threshold (needs split)
  1 = at or under threshold (done for this path)

Usage:
  python3 scripts/refresh_file_split_queue.py
  python3 scripts/refresh_file_split_queue.py --json-only
  python3 scripts/refresh_file_split_queue.py --check   # exit 1 if any status=0
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "docs" / "file-split-queue.json"
TXT_PATH = ROOT / "docs" / "file-split-queue.txt"
THRESHOLD = 1000

SKIP_DIRS = {
    "node_modules",
    ".next",
    ".git",
    "dist",
    "build",
    ".open-next",
    "out",
    "coverage",
    ".wrangler",
    "tmp",
    "__pycache__",
    ".turbo",
    ".history",
    "site-packages",
}
CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}


def is_skipped(path: Path) -> bool:
    if any(part in SKIP_DIRS for part in path.parts):
        return True
    if any(".venv" in part for part in path.parts):
        return True
    return False


def is_style_or_data(path: Path) -> bool:
    name = path.name
    if name.endswith("Styles.tsx") or name.endswith("Styles.ts"):
        return True
    if name.endswith(".css") or name.endswith(".scss"):
        return True
    if path.as_posix().endswith("i18n/messages.ts"):
        return True
    if ".card-compact." in name:
        return True
    return False


def count_lines(path: Path) -> int:
    return sum(1 for _ in path.open("r", encoding="utf-8", errors="ignore"))


def scan() -> tuple[list[dict], list[dict]]:
    queue: list[dict] = []
    excluded: list[dict] = []
    src = ROOT / "src"
    if not src.is_dir():
        return queue, excluded

    for path in src.rglob("*"):
        if not path.is_file() or is_skipped(path):
            continue
        if path.suffix not in CODE_EXT and path.suffix not in {".css", ".scss"}:
            continue
        lines = count_lines(path)
        if lines <= THRESHOLD:
            continue
        rel = path.relative_to(ROOT).as_posix()
        if is_style_or_data(path):
            excluded.append(
                {"path": rel, "lines": lines, "reason": "style_or_data"}
            )
        elif path.suffix in CODE_EXT:
            queue.append(
                {
                    "path": rel,
                    "lines": lines,
                    "status": 0,
                    "note": "",
                }
            )

    queue.sort(key=lambda r: (-r["lines"], r["path"]))
    excluded.sort(key=lambda r: (-r["lines"], r["path"]))
    return queue, excluded


def load_prev_notes() -> dict[str, str]:
    if not JSON_PATH.is_file():
        return {}
    try:
        data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    notes: dict[str, str] = {}
    for row in data.get("queue") or []:
        path = row.get("path")
        note = (row.get("note") or "").strip()
        if path and note:
            notes[path] = note
    return notes


def write_txt(doc: dict) -> None:
    lines = [
        "# 业务代码拆分队列（>1000 行；不含样式/文案）",
        f"# 更新: {doc['updated']}  阈值: {doc['threshold']}",
        "# status: 0=未达标  1=已拆到≤1000（刷新脚本按行数自动写）",
        "# 机器可读权威源: docs/file-split-queue.json",
        "# 刷新/对账: python3 scripts/refresh_file_split_queue.py",
        "# 检查是否清零: python3 scripts/refresh_file_split_queue.py --check",
        "",
    ]
    queue = doc.get("queue") or []
    if not queue:
        lines.append("(empty) 当前无超过阈值的业务文件 ✅")
    else:
        for i, row in enumerate(queue, 1):
            note = f"  # {row['note']}" if row.get("note") else ""
            lines.append(
                f"{i:02d}. [status={row['status']}] {row['lines']:5d}  {row['path']}{note}"
            )
    lines.append("")
    lines.append("# --- 不计入队列（样式/文案/备份，仅供参考）---")
    excluded = doc.get("excluded_over_threshold") or []
    if not excluded:
        lines.append("# (none)")
    else:
        for row in excluded:
            lines.append(
                f"     (skip) {row['lines']:5d}  {row['path']}  # {row.get('reason', '')}"
            )
    TXT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def refresh(*, write_txt_file: bool = True) -> dict:
    queue, excluded = scan()
    notes = load_prev_notes()
    for row in queue:
        if row["path"] in notes:
            row["note"] = notes[row["path"]]
        # Over threshold ⇒ always status 0
        row["status"] = 0

    # Also record recently completed paths still in notes? Optional: keep a done log.
    # For now status=1 only appears if we keep completed entries — user asked
    # status 0 vs split. Auto approach: queue only lists offenders (all status=0).
    # Completed files drop out of the queue (= effectively "done").
    # Provide completed_recent from previous queue that are now ≤ threshold.
    prev_paths: list[str] = []
    if JSON_PATH.is_file():
        try:
            prev = json.loads(JSON_PATH.read_text(encoding="utf-8"))
            prev_paths = [r["path"] for r in (prev.get("queue") or []) if r.get("path")]
        except (OSError, json.JSONDecodeError):
            prev_paths = []

    completed: list[dict] = []
    current_over = {r["path"] for r in queue}
    for path in prev_paths:
        if path in current_over:
            continue
        full = ROOT / path
        if not full.is_file():
            completed.append(
                {
                    "path": path,
                    "lines": None,
                    "status": 1,
                    "note": notes.get(path, "removed_or_renamed"),
                }
            )
            continue
        lines = count_lines(full)
        if lines <= THRESHOLD:
            completed.append(
                {
                    "path": path,
                    "lines": lines,
                    "status": 1,
                    "note": notes.get(path, ""),
                }
            )

    doc = {
        "version": 1,
        "updated": str(date.today()),
        "rule": (
            "业务代码单文件 ≤1000 行；样式/文案/备份不计入队列。"
            "queue 内均为超标文件 status=0；"
            "从 queue 消失或进入 completed_since_last_refresh 表示已达标 status=1。"
        ),
        "threshold": THRESHOLD,
        "queue": queue,
        "completed_since_last_refresh": completed,
        "excluded_over_threshold": excluded,
    }

    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    if write_txt_file:
        write_txt(doc)
    return doc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--json-only",
        action="store_true",
        help="Only write JSON (skip TXT)",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Refresh then exit 1 if any file still over threshold",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="No stdout summary",
    )
    args = parser.parse_args()
    doc = refresh(write_txt_file=not args.json_only)
    n = len(doc["queue"])
    done = len(doc.get("completed_since_last_refresh") or [])
    if not args.quiet:
        print(
            f"file-split-queue: {n} over {THRESHOLD}"
            + (f"; {done} newly ≤{THRESHOLD} since last refresh" if done else "")
        )
        for row in doc["queue"][:12]:
            print(f"  [0] {row['lines']:5d}  {row['path']}")
        if n > 12:
            print(f"  … +{n - 12} more")
    if args.check and n:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
