#!/usr/bin/env python3
"""Regression guard: stop hook fingerprint must be content-aware and post-success.

Fails if the hook:
1) writes fingerprint before publish succeeds / busy-skips after writing
2) fingerprints only file names (name-only) so same-file edits skip publish
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOOK = ROOT / ".cursor" / "hooks" / "feature-remark-stop.py"
WRAPPER = ROOT / ".cursor" / "hooks" / "auto-publish-mode1.sh"
HOOKS_JSON = ROOT / ".cursor" / "hooks.json"


def fail(msg: str) -> int:
    print(f"[check_auto_publish_fingerprint] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    if not HOOK.is_file():
        return fail(f"missing {HOOK.relative_to(ROOT)}")
    text = HOOK.read_text(encoding="utf-8")

    if "PUBLISH_BUSY" in text or "status == \"running\"" in text:
        return fail("busy-skip logic returned; POST should queue via maintenance center")

    if "urlopen" not in text and "urllib.request" not in text:
        return fail("publish POST missing")

    if "成功 POST" not in text and "入队" not in text:
        return fail("missing in-file 防复发 comment about POST/queue")

    # dirty-tree：指纹写在 urlopen 成功之后（clean-tree 提前 return 写指纹是允许的）
    dirty_write = None
    for m in re.finditer(r"FINGERPRINT_FILE\.write_text\(current", text):
        dirty_write = m.start()
    post_idx = text.find("urlopen")
    if dirty_write is None:
        return fail("success-path fingerprint write missing")
    if post_idx < 0 or dirty_write < post_idx:
        return fail("dirty-tree fingerprint must be written only after successful publish POST")

    if "_git_output(\"diff\")" not in text and 'git", "diff"' not in text:
        return fail("fingerprint must include git diff content")
    if "_git_output(\"diff\", \"--cached\")" not in text and 'diff", "--cached"' not in text:
        return fail("fingerprint must include git diff --cached content")
    if "status\", \"--porcelain\"" not in text and "status --porcelain" not in text:
        return fail("fingerprint must include git status --porcelain")

    if "summarize_feature_remark" not in text:
        return fail("hook must use summarize_feature_remark (≤20 字)")

    if not HOOKS_JSON.is_file() or "feature-remark-stop.py" not in HOOKS_JSON.read_text(
        encoding="utf-8"
    ):
        return fail("hooks.json stop must call feature-remark-stop.py")

    if WRAPPER.is_file():
        wrap = WRAPPER.read_text(encoding="utf-8")
        if "feature-remark-stop.py" not in wrap:
            return fail("auto-publish-mode1.sh should forward to feature-remark-stop.py")

    print("[check_auto_publish_fingerprint] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
