#!/usr/bin/env python3
"""Regression: teacher quiz must not background-poll sync; peek poll stops after peeked / quiz complete."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needle: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        raise SystemExit(f"FAIL: {path.relative_to(ROOT)} missing {needle!r}")


def must_not_contain(path: Path, needle: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle in text:
        raise SystemExit(f"FAIL: {path.relative_to(ROOT)} must not contain {needle!r}")


def main() -> None:
    jp_page = ROOT / "src/components/JpVocabPage.tsx"
    en_page = ROOT / "src/components/EnVocabPage.tsx"
    must_contain(jp_page, "enableBackgroundSyncPoll: false")
    must_contain(en_page, "enableBackgroundSyncPoll: false")
    must_not_contain(
        jp_page, "enableBackgroundSyncPoll: isTeacherMode && teacherQuizPollActive"
    )
    must_not_contain(
        en_page, "enableBackgroundSyncPoll: isTeacherMode && teacherQuizPollActive"
    )

    poll_gate = (ROOT / "src/lib/vocab-teacher-quiz-sync-poll.ts").read_text(
        encoding="utf-8"
    )
    # 抽完后即使末词卡仍开，也不得因 showQuizFlashcard 无限续命
    early_open = "if (opts.showQuizFlashcard) return true;"
    if early_open in poll_gate:
        raise SystemExit(
            "FAIL: vocab-teacher-quiz-sync-poll.ts must not early-return on "
            "showQuizFlashcard before quizComplete "
            "(post-complete stay-on-last-card → Worker 1102)"
        )
    if "if (opts.quizComplete)" not in poll_gate:
        raise SystemExit(
            "FAIL: vocab-teacher-quiz-sync-poll.ts missing quizComplete gate"
        )
    if "return Boolean(opts.showQuizFlashcard)" not in poll_gate:
        raise SystemExit(
            "FAIL: vocab-teacher-quiz-sync-poll.ts missing showQuizFlashcard "
            "return after quizComplete"
        )

    for rel in (
        "src/hooks/useJpVocabTeacherQuiz.ts",
        "src/hooks/useEnVocabTeacherQuiz.ts",
    ):
        text = (ROOT / rel).read_text(encoding="utf-8")
        if "学生 peek 只写一次" not in text and "亮灯后停轮询" not in text:
            if "停轮询" not in text:
                raise SystemExit(f"FAIL: {rel} missing peek stop-poll comment/logic")
        if "if (peeked)" not in text:
            raise SystemExit(f"FAIL: {rel} missing peeked early-exit")
        if (
            "setStudentPeekedCurrentWord(true);\n            return;" not in text
            and "setStudentPeekedCurrentWord(true);\r\n            return;" not in text
        ):
            idx = text.find("if (peeked)")
            if idx < 0:
                raise SystemExit(f"FAIL: {rel} missing if (peeked)")
            window = text[idx : idx + 400]
            if "return;" not in window:
                raise SystemExit(f"FAIL: {rel} peeked branch must return (stop poll)")
        if "quizSessionComplete" not in text:
            raise SystemExit(
                f"FAIL: {rel} must stop peek/live when quizSessionComplete "
                "(post-complete stay-on-last-card → Worker 1102)"
            )
        if "抽完留末词回看：清 live" not in text:
            raise SystemExit(f"FAIL: {rel} must clear live on session complete")

    must_contain(
        ROOT / "src/components/JpClassNotesEditModal.tsx", "共享备注给学生"
    )
    must_contain(
        ROOT / "src/components/EnClassNotesEditModal.tsx", "共享备注给学生"
    )
    print(
        "ok: vocab teacher quiz no sync poll + peek stop + "
        "post-complete stop + notes share"
    )


if __name__ == "__main__":
    main()
