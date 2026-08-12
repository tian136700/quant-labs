#!/usr/bin/env python3
"""禁止 hook 解构重复绑定（曾导致 Next: Identifier X has already been declared）。"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# const { a, a } = useFoo(  —— 构建期直接挂，部署白烧
_HOOK_DESTRUCTURE_RE = re.compile(
    r"const\s*\{([^{}]+)\}\s*=\s*(use[A-Z][A-Za-z0-9_]*)\s*\(",
    re.MULTILINE,
)

_SKIP_WORDS = frozenset({"as", "type", "readonly", "typeof", "keyof", "infer"})


def binding_names(block: str) -> list[str]:
    """从解构块提取绑定名（尽量忽略 as / 重命名右侧）。"""
    names: list[str] = []
    for raw in block.split(","):
        part = raw.strip()
        if not part or part.startswith("..."):
            continue
        # { foo: bar } / { foo: bar = 1 }
        if ":" in part and " as " not in part:
            left, right = part.split(":", 1)
            right_name = right.split("=", 1)[0].strip()
            m_right = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)$", right_name)
            if m_right:
                names.append(m_right.group(1))
                continue
            m_left = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)", left.strip())
            if m_left:
                names.append(m_left.group(1))
            continue
        if " as " in part:
            after = part.split(" as ", 1)[1].split("=", 1)[0].strip()
            m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)", after)
            if m:
                names.append(m.group(1))
            continue
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)", part.split("=", 1)[0].strip())
        if m and m.group(1) not in _SKIP_WORDS:
            names.append(m.group(1))
    return names


def find_duplicate_hook_destructures(
    root: Path | None = None,
) -> list[str]:
    """返回错误文案列表；空 = 通过。"""
    base = root or ROOT
    src = base / "src"
    errors: list[str] = []
    if not src.is_dir():
        return errors

    for path in sorted(src.rglob("*.tsx")) + sorted(src.rglob("*.ts")):
        if "node_modules" in path.parts:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        for m in _HOOK_DESTRUCTURE_RE.finditer(text):
            hook = m.group(2)
            names = binding_names(m.group(1))
            dup = sorted({n for n in names if names.count(n) > 1})
            if not dup:
                continue
            # 行号：匹配起点
            line = text.count("\n", 0, m.start()) + 1
            rel = path.relative_to(base).as_posix()
            errors.append(
                f"{rel}:{line}: {hook} 解构重复绑定 {', '.join(dup)}"
                "（会导致 Identifier has already been declared）"
            )
    return errors


def main() -> int:
    import sys

    errors = find_duplicate_hook_destructures()
    if errors:
        print("check_no_duplicate_hook_destructure: FAIL", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print("check_no_duplicate_hook_destructure: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
