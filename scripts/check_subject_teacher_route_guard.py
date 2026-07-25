#!/usr/bin/env python3
"""Regression: JP lesson view links must not be kicked to KO (WeChat/cache safe)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LIB = ROOT / "src/lib/subject-teacher-route-guard.ts"
GUARD = ROOT / "src/components/SubjectTeacherRouteGuard.tsx"
SHELL = ROOT / "src/components/AppShell.tsx"
NAV = ROOT / "src/hooks/useSiteNavItems.ts"
AUTH = ROOT / "src/contexts/EtrAuthProvider.tsx"
KO_GUARD = ROOT / "src/components/KoPronTeacherRouteGuard.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    for path in (LIB, GUARD, SHELL, NAV, AUTH, KO_GUARD):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    lib = LIB.read_text(encoding="utf-8")
    if "isJpVocabRefPath" not in lib or "isEnVocabRefPath" not in lib:
        fail("subject-teacher-route-guard must allow jp/en ref share paths")

    shell = SHELL.read_text(encoding="utf-8")
    if "SubjectTeacherRouteGuard" not in shell:
        fail("AppShell must mount SubjectTeacherRouteGuard")
    if 'from "./KoPronTeacherRouteGuard"' in shell:
        fail("AppShell must not import KoPronTeacherRouteGuard")

    # 查看页分支不得挂科目笼
    if "onJpVocabRef || onEnVocabRef" not in shell and "onJpVocabRef" not in shell:
        fail("AppShell must special-case vocab ref viewer paths")
    # crude: between onJpVocabRef early return and SubjectTeacher, ref branch should not include Guard
    ref_idx = shell.find("onJpVocabRef")
    if ref_idx < 0:
        fail("AppShell missing onJpVocabRef")
    # Find the first return after onJpVocabRef dedicated branch
    block = shell[ref_idx : ref_idx + 800]
    if "不挂科目老师路由笼" not in shell and "SubjectTeacherRouteGuard" in block.split("compareGatedShell")[0]:
        # Prefer explicit comment / structure from our fix
        if "教案" not in shell and block.count("SubjectTeacherRouteGuard") > 0:
            # If first small block after onJpVocabRef still mounts Guard before compareGatedShell-only branch, fail
            early = block.split("compareGatedShell")[0]
            if "SubjectTeacherRouteGuard" in early and "不挂" not in early:
                fail("AppShell ref viewer branch must not mount SubjectTeacherRouteGuard")

    if "不挂科目老师路由笼" not in shell:
        fail("AppShell must omit SubjectTeacherRouteGuard on ref viewer (WeChat share)")

    guard = GUARD.read_text(encoding="utf-8")
    if "authProbeDone" not in guard:
        fail("SubjectTeacherRouteGuard must wait for authProbeDone")
    if "isJpVocabRefPath" not in guard:
        fail("SubjectTeacherRouteGuard must no-op on jp ref paths")

    auth = AUTH.read_text(encoding="utf-8")
    if "authProbeDone" not in auth:
        fail("EtrAuthProvider must expose authProbeDone")
    if "setChecking(false)" in auth and "if (cached)" in auth:
        # ensure we don't set checking false solely from cache before probe
        cached_block_start = auth.find("const cached = readClientCache")
        cached_block = auth[cached_block_start : cached_block_start + 350]
        if "setChecking(false)" in cached_block:
            fail("must not setChecking(false) from localStorage cache alone before auth probe")

    ko = KO_GUARD.read_text(encoding="utf-8")
    if "router.replace(koPronPath())" in ko:
        fail("KoPronTeacherRouteGuard must not actively redirect")

    nav = NAV.read_text(encoding="utf-8")
    if "jpTeacherNav || enTeacherNav || koTeacherNav" not in nav:
        fail("useSiteNavItems must build multi-teacher nav as a union")

    print("OK: subject teacher route guard / ref share / authProbeDone")


if __name__ == "__main__":
    main()
