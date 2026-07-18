#!/usr/bin/env python3
"""Regression guard: auto-publish stop hook must not write fingerprint before publish succeeds.

Fails if the hook reintroduces busy-skip-after-writing-fingerprint (deploy never retries).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOOK = ROOT / ".cursor" / "hooks" / "auto-publish-mode1.sh"


def main() -> int:
    text = HOOK.read_text(encoding="utf-8")
    # Strip comments / blank lines for coarse structure checks
    code_lines = [
        ln
        for ln in text.splitlines()
        if ln.strip() and not ln.strip().startswith("#")
    ]
    code = "\n".join(code_lines)

    writes = [i for i, ln in enumerate(code_lines) if "FINGERPRINT_FILE" in ln and "echo" in ln]
    if not writes:
        print("[check_auto_publish_fingerprint] FAIL: no fingerprint write found", file=sys.stderr)
        return 1

    # Must not busy-skip after writing fingerprint
    for i, ln in enumerate(code_lines):
        if re.search(r"PUBLISH_BUSY|status == ['\"]running['\"]", ln):
            print(
                "[check_auto_publish_fingerprint] FAIL: busy-skip logic returned; "
                "POST should queue via maintenance center instead",
                file=sys.stderr,
            )
            return 1

    # Every fingerprint write must be either clean-tree branch or after successful python publish
    if "urlopen" not in code and "urllib.request" not in code:
        print("[check_auto_publish_fingerprint] FAIL: publish POST missing", file=sys.stderr)
        return 1

    # Ensure comment / contract still present so agents see the constraint in-file
    if "只能在" not in text and "成功 POST" not in text and "入队" not in text:
        print(
            "[check_auto_publish_fingerprint] FAIL: missing in-file防复发 comment",
            file=sys.stderr,
        )
        return 1

    # Fingerprint write for dirty tree must be inside `then` after python success
    if "then" not in code or 'echo "$CURRENT_FINGERPRINT"' not in text:
        print("[check_auto_publish_fingerprint] FAIL: success-path fingerprint write missing", file=sys.stderr)
        return 1

    # Detect old anti-pattern: write fingerprint then immediately check busy
    anti = re.search(
        r'echo\s+"\$CURRENT_FINGERPRINT"\s*>\s*"\$FINGERPRINT_FILE"[\s\S]{0,400}PUBLISH_BUSY',
        text,
    )
    if anti:
        print(
            "[check_auto_publish_fingerprint] FAIL: fingerprint written before busy check (anti-pattern)",
            file=sys.stderr,
        )
        return 1

    print("[check_auto_publish_fingerprint] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
