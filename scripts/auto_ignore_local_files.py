#!/usr/bin/env python3
"""提交前自动补全 .gitignore（仅针对本地运维/临时文件）。"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GITIGNORE = ROOT / ".gitignore"
MARK_BEGIN = "# auto-ignore-local begin"
MARK_END = "# auto-ignore-local end"

# 正常 .gitignore 远小于此；超过即视为异常，拒绝写入以免再次撑爆 Git/IDE。
MAX_GITIGNORE_BYTES = 256 * 1024
MAX_GITIGNORE_LINES = 2_000
MAX_MANAGED_RULES = 200

# 明确属于本地运维/无人值守辅助工具，不参与线上代码。
FIXED_LOCAL_PATTERNS = [
    "scripts/deploy_center/",
]
PROTECTED_TRACKED_RULES = {
    "scripts/auto_ignore_local_files.py",
}

# 已被顶层 .gitignore 覆盖的目录：禁止再往 auto-ignore 块里塞单文件路径
COVERED_BY_ROOT_IGNORE = (
    "node_modules/",
    ".next/",
    ".open-next/",
    ".wrangler/",
    ".turbo/",
    "dist/",
    "out/",
    ".vercel/",
    "coverage/",
    "tmp/",
    ".cursor/",
    ".history/",
    ".idea/",
    ".vscode/",
    "__pycache__/",
    "scripts/deploy_center/",
)

PATH_HINTS = (
    "/tmp/",
    "/logs/",
    "/local/",
    "/backup/",
    "/cache/",
    "/snapshots/",
    ".cursor/",
)

NAME_HINTS = (
    "local",
    "backup",
    "snapshot",
    "dump",
    "export",
    "token",
    "secret",
    "credential",
    "state",
    "debug",
)

SUFFIX_HINTS = (
    ".log",
    ".sqlite",
    ".sqlite3",
    ".sqlite-wal",
    ".sqlite-shm",
    ".db",
    ".dump.sql",
    ".export.sql",
)
CODE_SUFFIXES = (
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".css",
    ".html",
    ".md",
    ".json",
    ".yml",
    ".yaml",
    ".toml",
    ".sql",
)


def git_output(*args: str) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        return ""
    return proc.stdout.strip()


def candidate_paths() -> list[str]:
    changed = git_output("diff", "--name-only").splitlines()
    staged = git_output("diff", "--cached", "--name-only").splitlines()
    untracked = git_output("ls-files", "--others", "--exclude-standard").splitlines()
    seen: set[str] = set()
    out: list[str] = []
    for p in [*changed, *staged, *untracked]:
        p = p.strip().replace("\\", "/")
        if not p or p in seen:
            continue
        seen.add(p)
        out.append(p)
    return out


def should_ignore(path: str) -> bool:
    low = path.lower()
    if low.startswith("scripts/deploy_center/"):
        return True
    # 已有目录级忽略时，不要再写入单文件规则（否则 .gitignore 会膨胀）
    if covered_by_root_ignore(path):
        return False
    if any(low.endswith(s) for s in CODE_SUFFIXES):
        return False
    if any(h in f"/{low}" for h in PATH_HINTS):
        return True
    name = low.rsplit("/", 1)[-1]
    if any(k in name for k in NAME_HINTS):
        return True
    if any(low.endswith(s) for s in SUFFIX_HINTS):
        return True
    return False


def covered_by_root_ignore(path: str) -> bool:
    norm = path.replace("\\", "/")
    while norm.startswith("./"):
        norm = norm[2:]
    if "/__pycache__/" in f"/{norm}/" or norm.endswith("/__pycache__"):
        return True
    return any(
        norm == p.rstrip("/") or norm.startswith(p) for p in COVERED_BY_ROOT_IGNORE
    )


def prune_redundant_managed(managed: set[str]) -> set[str]:
    """丢掉已被顶层目录规则覆盖的单文件/子路径规则。"""
    out: set[str] = set()
    for rule in managed:
        r = rule.strip()
        if not r or r in PROTECTED_TRACKED_RULES:
            continue
        if covered_by_root_ignore(r.rstrip("/")):
            continue
        out.add(r)
    return out


def normalize_rule(path: str) -> str:
    if path.endswith("/"):
        return path
    abs_path = ROOT / path
    if abs_path.is_dir():
        return f"{path}/"
    return path


def load_gitignore_lines() -> list[str]:
    if not GITIGNORE.is_file():
        return []
    return GITIGNORE.read_text(encoding="utf-8").splitlines()


def strip_trailing_blank_lines(lines: list[str]) -> list[str]:
    out = list(lines)
    while out and not out[-1].strip():
        out.pop()
    return out


def collect_managed_rules(lines: list[str]) -> tuple[list[str], set[str]]:
    """移除全部 auto-ignore 标记块，合并其中规则；丢弃孤立 begin/end。"""
    base: list[str] = []
    managed: set[str] = set()
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if stripped == MARK_BEGIN:
            i += 1
            while i < len(lines) and lines[i].strip() != MARK_END:
                rule = lines[i].strip()
                if rule and rule not in (MARK_BEGIN, MARK_END):
                    managed.add(rule)
                i += 1
            if i < len(lines) and lines[i].strip() == MARK_END:
                i += 1
            continue
        if stripped in (MARK_BEGIN, MARK_END):
            i += 1
            continue
        base.append(lines[i])
        i += 1
    return strip_trailing_blank_lines(base), managed


def split_managed_block(lines: list[str]) -> tuple[list[str], set[str]]:
    return collect_managed_rules(lines)


def dedupe_base_lines(base_lines: list[str], managed_rules: set[str]) -> list[str]:
    """base 区与 managed 区重复的规则只保留在 managed 块内。"""
    managed = {rule.strip() for rule in managed_rules if rule.strip()}
    if not managed:
        return base_lines
    out: list[str] = []
    for line in base_lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and stripped in managed:
            continue
        out.append(line)
    return strip_trailing_blank_lines(out)


def validate_gitignore_payload(lines: list[str]) -> str | None:
    if len(lines) > MAX_GITIGNORE_LINES:
        return f".gitignore 行数 {len(lines)} 超过上限 {MAX_GITIGNORE_LINES}"
    encoded = ("\n".join(lines).strip() + "\n").encode("utf-8")
    if len(encoded) > MAX_GITIGNORE_BYTES:
        return f".gitignore 体积 {len(encoded)} 字节超过上限 {MAX_GITIGNORE_BYTES}"
    return None


def write_gitignore(base_lines: list[str], managed_rules: set[str]) -> bool:
    new_lines = list(base_lines)
    block = sorted(r for r in managed_rules if r)
    if len(block) > MAX_MANAGED_RULES:
        print(
            f"[auto-ignore] 错误：自动规则 {len(block)} 条超过上限 {MAX_MANAGED_RULES}，已中止写入",
            file=sys.stderr,
            flush=True,
        )
        raise SystemExit(2)

    if block:
        if new_lines and new_lines[-1] != "":
            new_lines.append("")
        new_lines.append(MARK_BEGIN)
        new_lines.extend(block)
        new_lines.append(MARK_END)

    err = validate_gitignore_payload(new_lines)
    if err:
        print(f"[auto-ignore] 错误：{err}，已中止写入", file=sys.stderr, flush=True)
        raise SystemExit(2)

    before = "\n".join(load_gitignore_lines()).strip()
    after = "\n".join(new_lines).strip()
    if before == after:
        return False
    GITIGNORE.write_text(after + "\n", encoding="utf-8")
    return True


def repair_oversized_gitignore() -> bool:
    """若 .gitignore 已异常膨胀，尝试剥离全部 auto-ignore 块后重写。"""
    if not GITIGNORE.is_file():
        return False
    size = GITIGNORE.stat().st_size
    line_count = sum(1 for _ in GITIGNORE.open(encoding="utf-8"))
    if size <= MAX_GITIGNORE_BYTES and line_count <= MAX_GITIGNORE_LINES:
        return False

    print(
        f"[auto-ignore] 警告：.gitignore 异常（{line_count} 行 / {size} 字节），正在修复…",
        flush=True,
    )
    raw_lines = load_gitignore_lines()
    base_lines, managed = collect_managed_rules(raw_lines)
    managed = {r for r in managed if r not in PROTECTED_TRACKED_RULES}
    managed = prune_redundant_managed(managed)
    managed.update(FIXED_LOCAL_PATTERNS)
    base_lines = dedupe_base_lines(base_lines, managed)
    write_gitignore(base_lines, managed)
    print("[auto-ignore] .gitignore 已修复", flush=True)
    return True


def main() -> int:
    repair_oversized_gitignore()

    candidates = candidate_paths()
    auto_rules = {normalize_rule(p) for p in candidates if should_ignore(p)}
    auto_rules.update(FIXED_LOCAL_PATTERNS)

    raw_lines = load_gitignore_lines()
    base_lines, old_managed = split_managed_block(raw_lines)
    old_managed = {r for r in old_managed if r not in PROTECTED_TRACKED_RULES}
    old_managed = prune_redundant_managed(old_managed)
    auto_rules = prune_redundant_managed(auto_rules)
    merged = prune_redundant_managed(old_managed | auto_rules)
    base_lines = dedupe_base_lines(base_lines, merged)

    changed = write_gitignore(base_lines, merged)
    if not changed:
        print("[auto-ignore] .gitignore 无新增规则", flush=True)
        return 0

    added = sorted(merged - old_managed)
    if added:
        print("[auto-ignore] 已自动加入忽略规则：", flush=True)
        for rule in added:
            print(f"  - {rule}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
