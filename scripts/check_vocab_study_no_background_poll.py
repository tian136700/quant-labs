#!/usr/bin/env python3
"""Regression: study pages must not background-poll shared / teacher-quiz-live."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    for rel in (
        "src/components/JpVocabStudyPage.tsx",
        "src/components/EnVocabStudyPage.tsx",
    ):
        text = (ROOT / rel).read_text(encoding="utf-8")
        for bad in (
            "STUDY_POLL_MS",
            "STUDY_POLL_HIDDEN_MS",
            "STUDY_QUIZ_LIVE_POLL",
            "resolveVocabPollIntervalMs",
            "teacher-quiz-live?scope=study",
            "loadShared().finally(schedule)",
        ):
            if bad in text:
                raise SystemExit(f"FAIL: {rel} must not contain {bad!r}")
        if "visibilitychange" not in text:
            raise SystemExit(f"FAIL: {rel} should still refresh on visibilitychange")
        if 'method: "POST"' not in text or "teacher-quiz-live" not in text:
            raise SystemExit(f"FAIL: {rel} must keep click-to-peek POST teacher-quiz-live")
    print("ok: study pages no shared/live background poll")


if __name__ == "__main__":
    main()
