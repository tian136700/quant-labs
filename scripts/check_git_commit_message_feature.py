#!/usr/bin/env python3
"""Regression: Bark「改动」行必须写清功能，不能被「脚本/功能索引」盖住。"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOD_PATH = ROOT / "scripts" / "git_commit_message.py"


def fail(msg: str) -> int:
    print(f"[check_git_commit_message_feature] FAIL: {msg}", file=sys.stderr)
    return 1


def load_mod():
    import sys

    spec = importlib.util.spec_from_file_location("git_commit_message", MOD_PATH)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    if not MOD_PATH.is_file():
        return fail(f"missing {MOD_PATH}")
    mod = load_mod()

    # 模拟本会话：韩语子域名 + 文档/回归脚本混在一起
    changes = [
        mod.FileChange("src/lib/ko-site-host.ts", "A"),
        mod.FileChange("wrangler.toml", "M"),
        mod.FileChange("src/lib/login-link-slug.ts", "M"),
        mod.FileChange("src/lib/admin-user-credentials.ts", "M"),
        mod.FileChange("docs/feature-index.md", "M"),
        mod.FileChange("scripts/check_ko_site_host.py", "A"),
        mod.FileChange(".cursor/rules/ko-pron-admin-teacher-split.mdc", "M"),
    ]
    diff = (
        '+export const KO_SITE_HOST = "korean.info-quests.com";\n'
        '+pattern = "korean.info-quests.com"\n'
        '+NEXT_PUBLIC_KO_SITE_URL = "https://korean.info-quests.com"\n'
        '+url: `${KO_SITE_URL}${koPronPath()}`,\n'
    )
    msg = mod._heuristic_message(changes, diff)
    short = mod.compress_feature_remark(msg)
    if len(short) > mod.FEATURE_REMARK_MAX_CHARS:
        return fail(f"short remark too long ({len(short)}): {short!r}")
    if "功能索引" in short:
        return fail(f"remark still dominated by 功能索引: {short!r}")
    if re_search_script_noise(short):
        return fail(f"remark still dominated by 脚本 noise: {short!r}")
    if "korean" not in short.lower() and "韩语" not in short:
        return fail(f"expected Korean subdomain feature in remark, got: {short!r}")

    # 抽查卡场景
    flash_changes = [
        mod.FileChange("src/components/KoPronTeacherQuizFlashcardModal.tsx", "M"),
        mod.FileChange("src/lib/ko-pron-review.ts", "M"),
        mod.FileChange("docs/feature-index.md", "M"),
        mod.FileChange("scripts/check_ko_pron_dark_theme.py", "M"),
    ]
    flash_diff = (
        "+ko-pron-flashcard-check-box\n"
        "+请先勾选熟悉程度\n"
        "+isKoPronLetterReviewLocked\n"
        "+background: var(--panel);\n"
    )
    flash_long = mod._heuristic_message(flash_changes, flash_diff)
    flash_short = mod.compress_feature_remark(flash_long)
    if len(flash_short) > mod.FEATURE_REMARK_MAX_CHARS:
        return fail(f"flashcard short too long: {flash_short!r}")
    if "功能索引" in flash_short:
        return fail(f"flashcard remark dominated by 功能索引: {flash_short!r}")

    # stop 钩子存在
    hook = ROOT / ".cursor" / "hooks" / "feature-remark-stop.py"
    if not hook.is_file():
        return fail("missing .cursor/hooks/feature-remark-stop.py")
    hooks_json = (ROOT / ".cursor" / "hooks.json").read_text(encoding="utf-8")
    if "feature-remark-stop.py" not in hooks_json:
        return fail("hooks.json stop must call feature-remark-stop.py")

    print("[check_git_commit_message_feature] OK")
    print(f"  subdomain short: {short}")
    print(f"  flashcard short: {flash_short}")
    return 0


def re_search_script_noise(msg: str) -> bool:
    return "脚本" in msg and ("处" in msg or "个文件" in msg)


if __name__ == "__main__":
    sys.exit(main())
