#!/usr/bin/env python3
"""Regression: EN teacher「发送读音」→ study toast via live+shared, browser TTS only."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LIVE_TYPE = ROOT / "src/lib/en-vocab-teacher-quiz-live.ts"
LIVE_DB = ROOT / "src/lib/en-vocab-db/live.ts"
LIVE_ROUTE = ROOT / "src/app/api/en-vocab/teacher-quiz-live/route.ts"
SHARED_ROUTE = ROOT / "src/app/api/en-vocab/shared/route.ts"
SIGNAL = ROOT / "src/lib/en-vocab-pronounce-signal.ts"
PRONOUNCE = ROOT / "src/lib/en-vocab-pronounce.ts"
SEND_BTN = ROOT / "src/components/en-vocab-page/EnVocabSendPronounceButton.tsx"
TOAST = ROOT / "src/components/en-vocab-study-page/EnVocabStudentPronounceToast.tsx"
BODY = (
    ROOT
    / "src/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardPageBody.tsx"
)
STUDY = ROOT / "src/components/EnVocabStudyPage.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def must_contain(path: Path, needle: str, label: str | None = None) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        fail(f"{path.relative_to(ROOT)} missing {label or needle!r}")


def must_not_contain(path: Path, needle: str, label: str | None = None) -> None:
    text = path.read_text(encoding="utf-8")
    if needle in text:
        fail(f"{path.relative_to(ROOT)} must not contain {label or needle!r}")


def main() -> None:
    for path in (
        LIVE_TYPE,
        LIVE_DB,
        LIVE_ROUTE,
        SHARED_ROUTE,
        SIGNAL,
        PRONOUNCE,
        SEND_BTN,
        TOAST,
        BODY,
        STUDY,
    ):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    must_contain(LIVE_TYPE, "pronounce_word_id")
    must_contain(LIVE_TYPE, "pronounce_text")
    must_contain(LIVE_TYPE, "pronounce_at")
    must_contain(LIVE_TYPE, "enVocabTeacherPronounceFromLive")

    must_contain(LIVE_DB, "sendEnVocabTeacherQuizLivePronounce")
    must_contain(LIVE_ROUTE, 'action === "send_pronounce"')
    must_contain(LIVE_ROUTE, "sendEnVocabTeacherQuizLivePronounce")

    must_contain(SHARED_ROUTE, "teacher_pronounce")
    must_contain(SHARED_ROUTE, "enVocabTeacherPronounceFromLive")

    must_contain(SIGNAL, "notifyEnVocabPronounceSent")
    must_contain(SIGNAL, "subscribeEnVocabPronounceSent")
    must_contain(SIGNAL, "shouldHandleEnVocabPronounceSignal")

    must_contain(PRONOUNCE, "speakEnVocabText")
    must_contain(PRONOUNCE, "speechSynthesis")

    must_contain(SEND_BTN, "发送读音")
    must_contain(SEND_BTN, "send_pronounce")
    must_contain(SEND_BTN, "JpVocabSaveProgressBar")
    must_contain(SEND_BTN, "notifyEnVocabPronounceSent")

    must_contain(TOAST, "老师发送了读音")
    must_contain(TOAST, "speakEnVocabText")
    must_contain(TOAST, "EnVocabSpeakButton")
    must_contain(TOAST, "再听一次")

    must_contain(BODY, "EnVocabSendPronounceButton")
    must_contain(BODY, "showSendPronounce")

    must_contain(STUDY, "EnVocabStudentPronounceToast")
    must_contain(STUDY, "applyTeacherPronounce")
    must_contain(STUDY, "teacher_pronounce")
    must_contain(STUDY, "subscribeEnVocabPronounceSent")
    # 部署曾因 signal.at 被收成 never 失败：须先取 signalAt；helper 只收非空 signal
    must_contain(STUDY, "const signalAt = signal.at")
    must_contain(STUDY, "handled ?? signalAt")
    signal_src = SIGNAL.read_text(encoding="utf-8")
    if (
        "shouldHandleEnVocabPronounceSignal(\n"
        "  signal: EnVocabTeacherPronounceSignal | null | undefined,"
    ) in signal_src or "signal?: EnVocabTeacherPronounceSignal | null" in signal_src:
        fail(
            "shouldHandleEnVocabPronounceSignal must take non-null signal "
            "(null|undefined param + signal?.at caused Next typecheck never)"
        )
    if "signal: EnVocabTeacherPronounceSignal," not in signal_src:
        fail("shouldHandleEnVocabPronounceSignal must take EnVocabTeacherPronounceSignal")

    # 禁止学生端为读音另开 live 定时轮询
    study = STUDY.read_text(encoding="utf-8")
    if "setInterval" in study and "teacher-quiz-live" in study:
        fail("EnVocabStudyPage must not poll teacher-quiz-live on an interval")
    must_not_contain(
        STUDY,
        'fetch("/api/en-vocab/teacher-quiz-live?scope=study")',
        "dedicated study live poll fetch",
    )

    # 禁止音频上传 / 第三方音源路径混进发送读音按钮
    send = SEND_BTN.read_text(encoding="utf-8")
    for bad in ("FormData", "audio/", ".mp3", "new Audio(", "MediaRecorder"):
        if bad in send:
            fail(f"EnVocabSendPronounceButton must not use audio upload/path ({bad})")

    print("OK: EN send-pronounce guards present (live+shared signal, browser TTS)")


if __name__ == "__main__":
    main()
