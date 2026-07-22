#!/usr/bin/env python3
"""Regression: /admin/users trackpad scroll traps must stay fixed."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    lock = (ROOT / "src/lib/body-scroll-lock.ts").read_text(encoding="utf-8")
    if "lockCount" not in lock or "lockBodyScroll" not in lock:
        fail("body-scroll-lock.ts missing refcounted lockBodyScroll")

    page = (ROOT / "src/components/AdminUsersPage.tsx").read_text(encoding="utf-8")
    if "lockBodyScroll" not in page:
        fail("AdminUsersPage must use lockBodyScroll")
    if 'document.body.style.overflow = "hidden"' in page:
        fail("AdminUsersPage must not set body.overflow directly")

    for name in ("AdminUserEditModal.tsx", "AdminUserBindTeacherModal.tsx"):
        text = (ROOT / "src/components" / name).read_text(encoding="utf-8")
        if 'document.body.style.overflow = "hidden"' in text:
            fail(f"{name} must not nest body.overflow lock (parent already locks)")

    globals_css = (ROOT / "src/app/globals.css").read_text(encoding="utf-8")
    if ".admin-table-wrap" not in globals_css:
        fail("globals.css missing .admin-table-wrap")
    # Require overflow-y: clip near admin-table-wrap block
    idx = globals_css.find(".admin-table-wrap")
    block = globals_css[idx : idx + 400]
    if "overflow-y: clip" not in block:
        fail("globals.css .admin-table-wrap must set overflow-y: clip")

    mobile = (ROOT / "src/app/mobile.css").read_text(encoding="utf-8")
    midx = mobile.find(".admin-table-wrap")
    if midx < 0:
        fail("mobile.css missing .admin-table-wrap")
    mblock = mobile[midx : midx + 300]
    if "overflow-y: clip" not in mblock:
        fail("mobile.css .admin-table-wrap must set overflow-y: clip")

    print("OK: admin users trackpad scroll guards present")


if __name__ == "__main__":
    main()
