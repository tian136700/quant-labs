#!/usr/bin/env python3
"""Regression: board docx fixture dry-run + fingerprint helper present."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENV_PY = ROOT / "scripts" / ".venv-board-docx" / "bin" / "python"
API = ROOT / "scripts" / "jp-lesson-board-docx-api.py"
BUILD = ROOT / "scripts" / "lib" / "jp_lesson_board_docx_build.py"
ROUTE = ROOT / "src" / "app" / "api" / "jp-lesson" / "board-docx" / "route.ts"
DOC = ROOT / "docs" / "jp-lesson-board-docx-api.txt"
STAGE = ROOT / "scripts" / "jp-lesson-board-docx-stage.sh"
SETUP = ROOT / "scripts" / "setup-jp-lesson-board-docx-mac.sh"
MENU = ROOT / "src" / "components" / "JpVocabRefDownloadMenu.tsx"


def main() -> int:
    for p in (API, BUILD, ROUTE, DOC, STAGE, SETUP, MENU):
        if not p.is_file():
            raise SystemExit(f"FAIL: missing {p.relative_to(ROOT)}")

    menu = MENU.read_text(encoding="utf-8")
    if "board-docx?lesson_id=" not in menu:
        raise SystemExit("FAIL: download menu must prefer prebuilt board-docx")
    if "读音版生成中" not in menu:
        raise SystemExit("FAIL: download menu must fallback with status hint")

    stage = STAGE.read_text(encoding="utf-8")
    if "vocab_fill_assert_quiz_gate_ok" not in stage:
        raise SystemExit("FAIL: stage must call quiz gate")

    sys.path.insert(0, str(ROOT / "scripts"))
    from maintenance_center.cron_tasks.registry import CRON_TASKS

    task = next((t for t in CRON_TASKS if t.id == "jp-lesson-board-docx"), None)
    if task is None:
        raise SystemExit("FAIL: registry missing jp-lesson-board-docx")
    if "音调" not in task.fill_content:
        raise SystemExit("FAIL: fill_content must include 音调")

    py = str(VENV_PY if VENV_PY.is_file() else Path(sys.executable))
    proc = subprocess.run(
        [py, str(API), "--fixture-dry-run"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise SystemExit(f"FAIL fixture dry-run: {proc.stderr or proc.stdout}")
    text = proc.stdout.strip()
    try:
        info = json.loads(text)
    except json.JSONDecodeError:
        # tolerate trailing logs: find outermost object
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise SystemExit(f"FAIL: no JSON from dry-run: {text[:400]}")
        info = json.loads(text[start : end + 1])
    if not info.get("ok"):
        raise SystemExit(f"FAIL: dry-run not ok: {info}")
    splits = info.get("splits") or []
    if splits != [381, 630, 870, 1095, 1295]:
        raise SystemExit(f"FAIL: unexpected splits {splits}")
    print("ok: jp-lesson-board-docx")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
