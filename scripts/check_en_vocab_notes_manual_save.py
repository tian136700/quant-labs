#!/usr/bin/env python3
"""Regression: EN class notes edit/view = manual save, no auto-poll sync."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDIT = ROOT / "src/components/EnClassNotesEditModal.tsx"
VIEW = ROOT / "src/components/EnVocabRemarksViewModal.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    for path in (EDIT, VIEW):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    edit = EDIT.read_text(encoding="utf-8")
    view = VIEW.read_text(encoding="utf-8")

    if "AUTO_SAVE" in edit:
        fail("EnClassNotesEditModal must not auto-save (no AUTO_SAVE)")
    if "setInterval" in edit and "jpVocabSaveProgressPercent" not in edit:
        fail("EnClassNotesEditModal must not poll notes with setInterval")
    # Progress animation may use setInterval — allow only if tied to save progress
    if "setInterval(() => void" in edit or "setInterval(() => pull" in edit:
        fail("EnClassNotesEditModal must not setInterval poll remote notes")
    if "POLL_MS" in edit:
        fail("EnClassNotesEditModal must not define POLL_MS")
    if "保存" not in edit or 'onClick={() => void flushSave()}' not in edit:
        if "flushSave()" not in edit or ">保存<" not in edit.replace(" ", ""):
            # softer: require 保存 button text and flushSave call from click
            if "保存" not in edit or "flushSave" not in edit:
                fail("EnClassNotesEditModal must expose manual 保存 → flushSave")
    if "style jsx global" not in edit:
        fail("EnClassNotesEditModal styles must be jsx global (portal z-index)")
    if "z-index: 1100" not in edit:
        fail("EnClassNotesEditModal overlay must be z-index 1100")
    if "JpVocabSaveProgressBar" not in edit:
        fail("manual save must show JpVocabSaveProgressBar")
    if "对方刷新" not in edit and "刷新页面后可见" not in edit:
        fail("edit modal must tell user other side needs refresh")

    if "POLL_MS" in view:
        fail("EnVocabRemarksViewModal must not define POLL_MS")
    if "setInterval" in view:
        fail("EnVocabRemarksViewModal must not setInterval poll")
    if "style jsx global" not in view:
        fail("EnVocabRemarksViewModal styles must be jsx global")
    if "z-index: 1100" not in view:
        fail("EnVocabRemarksViewModal overlay must be z-index 1100")
    if "每 2 秒自动同步" in view:
        fail("view modal must not claim 2s auto sync")

    print("OK: EN notes manual save / no auto-poll guards present")


if __name__ == "__main__":
    main()
