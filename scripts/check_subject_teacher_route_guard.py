#!/usr/bin/env python3
"""Regression: multi-subject teachers must not be kicked from JP lesson view to KO."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LIB = ROOT / "src/lib/subject-teacher-route-guard.ts"
GUARD = ROOT / "src/components/SubjectTeacherRouteGuard.tsx"
SHELL = ROOT / "src/components/AppShell.tsx"
NAV = ROOT / "src/hooks/useSiteNavItems.ts"
KO_GUARD = ROOT / "src/components/KoPronTeacherRouteGuard.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    for path in (LIB, GUARD, SHELL, NAV, KO_GUARD):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    lib = LIB.read_text(encoding="utf-8")
    if "isJpVocabRefPath" not in lib or "isEnVocabRefPath" not in lib:
        fail("subject-teacher-route-guard must allow jp/en ref share paths")
    if "flags.jp && isJpVocabTeacherAllowedPath" not in lib:
        fail("allowed paths must union jp+en+ko teacher modules")

    shell = SHELL.read_text(encoding="utf-8")
    if "SubjectTeacherRouteGuard" not in shell:
        fail("AppShell must mount SubjectTeacherRouteGuard")
    # Must not remount the old active ko cage
    if shell.count("KoPronTeacherRouteGuard") > 0 and "SubjectTeacherRouteGuard" in shell:
        # empty stub file may still be imported — forbid import of KoPron in AppShell
        if "from \"./KoPronTeacherRouteGuard\"" in shell or "from '@/components/KoPronTeacherRouteGuard'" in shell:
            fail("AppShell must not import KoPronTeacherRouteGuard (use SubjectTeacherRouteGuard only)")

    ko = KO_GUARD.read_text(encoding="utf-8")
    if "router.replace(koPronPath())" in ko:
        fail("KoPronTeacherRouteGuard must not actively redirect (stub only)")

    nav = NAV.read_text(encoding="utf-8")
    if "jpTeacherNav || enTeacherNav || koTeacherNav" not in nav:
        fail("useSiteNavItems must build multi-teacher nav as a union")
    # old exclusive early returns
    if "if (koTeacherNav) {\n    return [" in nav or "if (koTeacherNav) {\n      return [" in nav:
        fail("useSiteNavItems must not early-return only Korean nav when koTeacherNav")

    # quick node-less sanity: dual flags allow jp ref
    # (logic covered by string checks above)

    print("OK: subject teacher route guard / multi-nav union")


if __name__ == "__main__":
    main()
