#!/usr/bin/env python3
"""Refresh docs/external-apis-for-copy.txt from docs/*-api.txt (+ howto)."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUT = DOCS / "external-apis-for-copy.txt"


def first_title(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    for line in text.splitlines():
        s = line.strip()
        if not s or set(s) <= {"=", "-", "#"}:
            continue
        return s
    return path.name


def extract_url(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    stem = path.stem  # e.g. jp-lesson-upload-mixed-api
    # Prefer path segment from filename (upload-mixed, download-all, …)
    hint_parts = [
        p
        for p in stem.replace("_", "-").split("-")
        if p not in {"api", "jp", "en", "ko", "vocab", "lesson", "local"}
    ]

    def score(line: str) -> int:
        s = 0
        if "https://" in line:
            s += 5
        if re.search(r"\b(POST|GET|PUT|PATCH|DELETE)\b", line):
            s += 3
        for part in hint_parts:
            if part and part in line:
                s += 4
        if "/api/" in line:
            s += 1
        return s

    candidates: list[tuple[int, str]] = []
    # Prefer block under 线上地址
    sections = re.split(r"\n线上地址\n-+\n", text, maxsplit=1)
    search_blobs = [sections[1]] if len(sections) > 1 else [text]
    search_blobs.append(text)

    for blob in search_blobs:
        for line in blob.splitlines():
            m = re.search(
                r"((?:POST|GET|PUT|PATCH|DELETE)\s+(?:https?://\S+|/\S+))",
                line,
            )
            if m:
                candidates.append((score(line), m.group(1).rstrip(")。.,，")))
            else:
                m2 = re.search(r"(https?://\S+/api/\S+)", line)
                if m2:
                    candidates.append((score(line), m2.group(1).rstrip(")。.,，")))

    if candidates:
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1]
    m3 = re.search(r"/api/[a-z0-9_./\-]+", text, re.I)
    return m3.group(0) if m3 else "(见文件内线上地址)"


def main() -> int:
    api_files = sorted(DOCS.glob("*-api.txt"))
    howto = sorted(
        p
        for p in DOCS.glob("*-howto.txt")
        if p.name != "external-apis-for-copy.txt"
    )
    if not api_files and not howto:
        print("no api/howto txt under docs/", file=sys.stderr)
        return 1

    lines: list[str] = [
        "对外接口说明 · 复制入口（自动生成）",
        "================================",
        "",
        "用法：打开下面列出的单个 TXT，整份复制给其它项目对接。",
        "生成：python3 scripts/refresh_external_api_docs_index.py",
        "约定：.cursor/rules/api-call-docs-txt.mdc",
        "",
        "—— 接口调用说明（*-api.txt）——",
        "",
    ]
    for i, path in enumerate(api_files, 1):
        rel = path.relative_to(ROOT).as_posix()
        lines.append(f"{i}. {first_title(path)}")
        lines.append(f"   文件：{rel}")
        lines.append(f"   调用：{extract_url(path)}")
        lines.append("")

    if howto:
        lines.append("—— 其它跨项目说明（*-howto.txt）——")
        lines.append("")
        for i, path in enumerate(howto, 1):
            rel = path.relative_to(ROOT).as_posix()
            lines.append(f"{i}. {first_title(path)}")
            lines.append(f"   文件：{rel}")
            lines.append("")

    lines.append("最近相关：日语新课合传 → docs/jp-lesson-upload-mixed-api.txt")
    lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(api_files)} api + {len(howto)} howto)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
