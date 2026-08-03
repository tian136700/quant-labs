#!/usr/bin/env python3
"""Regression: JP/EN teacher quiz always starts in random mode (never sequential).

Sequential order lets students memorize today's 1…N sequence. New sessions must
always shuffle; pickRandom* must not coin-flip sequential/random.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LIBS = [
    ("Jp", ROOT / "src/lib/jp-vocab-teacher-quiz.ts"),
    ("En", ROOT / "src/lib/en-vocab-teacher-quiz.ts"),
]

HOOKS = [
    ("Jp", ROOT / "src/hooks/useJpVocabTeacherQuiz.ts"),
    ("En", ROOT / "src/hooks/useEnVocabTeacherQuiz.ts"),
]

TOOLBARS = [
    ROOT / "src/components/jp-vocab-page/JpVocabPageToolbar.tsx",
    ROOT / "src/components/en-vocab-page/EnVocabPageToolbar.tsx",
]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def extract_fn(src: str, name: str) -> str:
    m = re.search(
        rf"export function {re.escape(name)}\([\s\S]*?\n\}}(?:\n|$)",
        src,
    )
    if not m:
        fail(f"missing export function {name}")
    return m.group(0)


def check_pick(lang: str, path: Path) -> None:
    src = path.read_text(encoding="utf-8")
    name = f"pickRandom{lang}VocabTeacherQuizMode"
    body = extract_fn(src, name)
    if "Math.random" in body:
        fail(f"{path.name}: {name} must not Math.random coin-flip modes")
    if '"sequential"' in body or "'sequential'" in body:
        fail(f"{path.name}: {name} must not return sequential")
    if 'return "random"' not in body and "return 'random'" not in body:
        fail(f"{path.name}: {name} must return \"random\"")

    create = f"create{lang}VocabTeacherQuizSession"
    create_body = extract_fn(src, create)
    if 'const mode' not in create_body and 'mode: "random"' not in create_body:
        # must force random regardless of _mode arg
        if 'mode: JpVocabTeacherQuizMode = "random"' not in create_body and \
           'mode: EnVocabTeacherQuizMode = "random"' not in create_body and \
           'const mode: JpVocabTeacherQuizMode = "random"' not in create_body and \
           'const mode: EnVocabTeacherQuizMode = "random"' not in create_body:
            fail(f"{path.name}: {create} must force mode = \"random\"")
    if 'session.mode === "sequential"' in src and \
       "wordIds = targetIds" in extract_fn(src, f"expand{lang}VocabTeacherQuizSessionForTarget"):
        fail(f"{path.name}: expand must not rebuild sequential target order")


def check_storage(lang: str) -> None:
    path = ROOT / f"src/lib/{lang.lower()}-vocab-teacher-quiz-storage.ts"
    if not path.is_file():
        fail(f"missing {path}")
    src = path.read_text(encoding="utf-8")
    if 'mode === "sequential"' not in src or "return null" not in src:
        fail(f"{path.name}: must discard legacy sequential sessions on read")


def check_hook(lang: str, path: Path) -> None:
    src = path.read_text(encoding="utf-8")
    # startTeacherQuizWithRandomMode must call pickRandom* (single source of truth)
    m = re.search(
        r"const startTeacherQuizWithRandomMode = useCallback\(\s*"
        r"\([\s\S]*?\[requestTeacherQuizSession\]\s*\)",
        src,
    )
    if not m:
        fail(f"{path.name}: missing startTeacherQuizWithRandomMode")
    body = m.group(0)
    pick = f"pickRandom{lang}VocabTeacherQuizMode"
    if pick not in body and '"random"' not in body and "'random'" not in body:
        fail(
            f"{path.name}: startTeacherQuizWithRandomMode must use {pick}() "
            'or hardcode "random"'
        )
    if re.search(r'requestTeacherQuizSession\(\s*"sequential"', body):
        fail(f"{path.name}: must not start quiz with sequential")


def check_toolbar(path: Path) -> None:
    src = path.read_text(encoding="utf-8")
    if "正序或随机" in src or "选用正序" in src:
        fail(f"{path.name}: toolbar must not advertise sequential/random coin-flip")
    if 'teacherQuizInProgress ? "继续抽查" : "开始抽查"' not in src:
        fail(
            f"{path.name}: quiz button must be 开始抽查 / 继续抽查 "
            "(not bare 抽查)"
        )
    if path.name == "JpVocabPageToolbar.tsx":
        # Teacher toolbar must not expose 更新缓存; admin may keep it behind isAdminMode.
        if re.search(
            r"\{isAdminMode \? \(\s*<button[\s\S]*?更新缓存[\s\S]*?\) : null\}",
            src,
        ) is None and re.search(
            r"isAdminMode \?[\s\S]{0,400}更新缓存",
            src,
        ) is None:
            fail(
                f"{path.name}: teacher toolbar must hide 更新缓存 "
                "(only show under isAdminMode)"
            )
        if re.search(r">刷新<|>刷新中", src):
            fail(
                f"{path.name}: admin cache button must be labeled 更新缓存 "
                "(not 刷新 — users mistake it for a full page reload)"
            )


def main() -> None:
    for lang, path in LIBS:
        if not path.is_file():
            fail(f"missing {path}")
        check_pick(lang, path)
        check_storage(lang)
    for lang, path in HOOKS:
        if not path.is_file():
            fail(f"missing {path}")
        check_hook(lang, path)
    for path in TOOLBARS:
        if not path.is_file():
            fail(f"missing {path}")
        check_toolbar(path)
    print("OK: teacher quiz start is random-only (jp + en)")


if __name__ == "__main__":
    main()
