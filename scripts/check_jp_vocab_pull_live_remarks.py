#!/usr/bin/env python3
"""回归：学生卡「拉取实时备注」按需 GET；备注查看弹窗禁止定时轮询。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    section = (
        ROOT
        / "src/components/jp-vocab-teacher-quiz/JpVocabFlashcardNotesSection.tsx"
    ).read_text(encoding="utf-8")
    fetch_helper = (
        ROOT / "src/lib/jp-vocab-fetch-class-notes.ts"
    ).read_text(encoding="utf-8")
    study = (ROOT / "src/components/JpVocabStudyPage.tsx").read_text(
        encoding="utf-8"
    )
    flashcard = (
        ROOT / "src/components/JpVocabTeacherQuizFlashcardModal.tsx"
    ).read_text(encoding="utf-8")
    view = (
        ROOT / "src/components/JpVocabRemarksViewModal.tsx"
    ).read_text(encoding="utf-8")

    if "拉取实时备注" not in section:
        errors.append("JpVocabFlashcardNotesSection must show 拉取实时备注")
    if "fetchJpVocabClassNotesWord" not in section:
        errors.append("notes section must call fetchJpVocabClassNotesWord")
    if "export async function fetchJpVocabClassNotesWord" not in fetch_helper:
        errors.append("jp-vocab-fetch-class-notes.ts must export fetch helper")
    if "/api/jp-vocab/class-notes" not in fetch_helper:
        errors.append("fetch helper must hit GET /api/jp-vocab/class-notes")

    if "onShowPulledRemarks={setViewingRemarksWord}" not in study:
        errors.append(
            "JpVocabStudyPage must wire onShowPulledRemarks to viewing modal"
        )
    if "onShowPulledRemarks" not in flashcard:
        errors.append("flashcard must accept onShowPulledRemarks")
    if "JpVocabFlashcardNotesSection" not in flashcard:
        errors.append("flashcard must render JpVocabFlashcardNotesSection")

    if re.search(r"setInterval\s*\(", view):
        errors.append(
            "JpVocabRemarksViewModal must not setInterval-poll class-notes"
        )
    if "POLL_MS" in view:
        errors.append("JpVocabRemarksViewModal must not define POLL_MS")
    if "每 2 秒自动同步" in view:
        errors.append("RemarksViewModal must not advertise 2s auto sync")

    if errors:
        print("check_jp_vocab_pull_live_remarks FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("check_jp_vocab_pull_live_remarks: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
