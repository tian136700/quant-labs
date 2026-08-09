#!/usr/bin/env python3
"""表格内 fixed 下拉须用 fixedDropdownPanelStyle，禁止只往下开导致底边裁切。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

HELPER = ROOT / "src/lib/fixed-dropdown-panel.ts"

MENUS = [
    ROOT / "src/components/JpVocabRefDownloadMenu.tsx",
    ROOT / "src/components/EnVocabRefDownloadMenu.tsx",
    ROOT / "src/components/JpLessonCopyMenu.tsx",
    ROOT / "src/components/EnLessonCopyMenu.tsx",
    ROOT / "src/components/JpLessonBatchCopyMenu.tsx",
]

# Bare "always open below" without flip helper
BAD_ALWAYS_DOWN = re.compile(
    r"top:\s*rect\.bottom\s*\+\s*\d+",
    re.MULTILINE,
)


def main() -> int:
    errors: list[str] = []

    if not HELPER.is_file():
        errors.append("missing src/lib/fixed-dropdown-panel.ts")
    else:
        text = HELPER.read_text(encoding="utf-8")
        for needle in (
            "fixedDropdownPanelStyle",
            "spaceBelow",
            "openUp",
            "bottom:",
        ):
            if needle not in text:
                errors.append(f"{HELPER.relative_to(ROOT)}: missing {needle!r}")

    for path in MENUS:
        rel = str(path.relative_to(ROOT))
        if not path.is_file():
            errors.append(f"missing {rel}")
            continue
        text = path.read_text(encoding="utf-8")
        if "fixedDropdownPanelStyle" not in text:
            errors.append(f"{rel}: must import/use fixedDropdownPanelStyle")
        if BAD_ALWAYS_DOWN.search(text):
            errors.append(
                f"{rel}: ban bare top: rect.bottom+N — use fixedDropdownPanelStyle flip"
            )

    if errors:
        print("check_fixed_dropdown_viewport FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("check_fixed_dropdown_viewport OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
