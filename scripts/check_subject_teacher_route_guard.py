#!/usr/bin/env python3
"""Regression: JP lesson view links must not be kicked to KO (WeChat/cache safe)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LIB = ROOT / "src/lib/subject-teacher-route-guard.ts"
GUARD = ROOT / "src/components/SubjectTeacherRouteGuard.tsx"
MAINT = ROOT / "src/components/MaintenanceRouteGuard.tsx"
SHELL = ROOT / "src/components/AppShell.tsx"
NAV = ROOT / "src/hooks/useSiteNavItems.ts"
AUTH = ROOT / "src/contexts/EtrAuthProvider.tsx"
KO_GUARD = ROOT / "src/components/KoPronTeacherRouteGuard.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    for path in (LIB, GUARD, MAINT, SHELL, NAV, AUTH, KO_GUARD):
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

    # 查看页分支不得挂科目笼 / 封禁笼（链接不设权限，账号被封也能看）
    if "onJpVocabRef || onEnVocabRef" not in shell and "onJpVocabRef" not in shell:
        fail("AppShell must special-case vocab ref viewer paths")
    ref_idx = shell.find("if (onJpVocabRef || onEnVocabRef)")
    if ref_idx < 0:
        ref_idx = shell.find("onJpVocabRef")
    if ref_idx < 0:
        fail("AppShell missing onJpVocabRef")
    next_if = shell.find("\n  if (", ref_idx + 10)
    early = shell[ref_idx : next_if if next_if > ref_idx else ref_idx + 600]
    if "SubjectTeacherRouteGuard" in early:
        fail("AppShell ref viewer branch must not mount SubjectTeacherRouteGuard")
    if "MaintenanceRouteGuard" in early:
        fail("AppShell ref viewer branch must not mount MaintenanceRouteGuard (disabled users must open share links)")
    if "不挂任何鉴权" not in shell and "不挂科目老师路由笼" not in shell:
        fail("AppShell must document that ref viewer omits auth/ban guards")

    guard = GUARD.read_text(encoding="utf-8")
    if "authProbeDone" not in guard:
        fail("SubjectTeacherRouteGuard must wait for authProbeDone")
    if "isJpVocabRefPath" not in guard:
        fail("SubjectTeacherRouteGuard must no-op on jp ref paths")

    maint = MAINT.read_text(encoding="utf-8")
    if "isJpVocabRefPath" not in maint or "isEnVocabRefPath" not in maint:
        fail("MaintenanceRouteGuard must no-op on jp/en ref paths (banned account still opens lesson view)")

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

    print("OK: subject teacher route guard / ref share (no auth/ban) / authProbeDone")


if __name__ == "__main__":
    main()
