#!/usr/bin/env python3
"""Wire useEnVocabTeacherQuiz into EnVocabPage — surgical deletes only."""
from __future__ import annotations

from pathlib import Path

PAGE = Path(__file__).resolve().parents[1] / "src/components/EnVocabPage.tsx"

HOOK = """
  const {
    quizSession,
    setQuizSession,
    showQuizFlashcard,
    setShowQuizFlashcard,
    studentPeekedCurrentWord,
    setStudentPeekedCurrentWord,
    showTeacherQuizIntro,
    pendingTeacherQuizSession,
    handleTeacherQuizIntroConfirm,
    handleTeacherQuizIntroClose,
    quizCardPreviewWordId,
    setQuizCardPreviewWordId,
    quizCardPreviewSession,
    closeQuizCardPreview,
    quizWordHasLevel,
    startTeacherQuizWithRandomMode,
    resumeTeacherQuizFlashcard,
    finishTeacherQuiz,
    teacherQuizLocksTable,
    teacherQuizInProgress,
    quizFlashcardWordId,
  } = useEnVocabTeacherQuiz({
    locale,
    user,
    checking,
    loading,
    canOperate,
    isAdminMode,
    words,
    sessionLevel,
    sessionReviewAt,
    displayOrder,
    quizTarget,
    quizTargetWords,
    quizTargetWordIds,
    dailySeqByWordId,
    dailyQuizProgress,
    setSharedTodayWordIds,
    setStatus,
  });

"""


def main() -> None:
    raw = PAGE.read_text(encoding="utf-8")
    if "useEnVocabTeacherQuiz({" in raw:
        raise SystemExit("already wired")

    lines = raw.splitlines(keepends=True)

    def idx(substr: str, start: int = 0) -> int:
        for i in range(start, len(lines)):
            if substr in lines[i]:
                return i
        raise RuntimeError(f"missing: {substr!r} from {start}")

    def delete(start: int, end_inclusive: int, label: str) -> None:
        del lines[start : end_inclusive + 1]
        print(f"- {label} ({start+1}..{end_inclusive+1})")

    i = idx('useEnVocabReviewActions } from "@/hooks/useEnVocabReviewActions"')
    lines.insert(
        i + 1,
        'import { useEnVocabTeacherQuiz } from "@/hooks/useEnVocabTeacherQuiz";\n',
    )
    print("+ import")

    i = idx("quizCardPreviewWordId, setQuizCardPreviewWordId")
    start = i - 1 if "管理员" in lines[i - 1] else i
    end = i
    while ");" not in lines[end]:
        end += 1
    delete(start, end, "quizCardPreview state")

    i = idx("const [quizSession, setQuizSession]")
    end = idx("pendingTeacherQuizSession", i)
    while ");" not in lines[end]:
        end += 1
    delete(i, end, "quiz session states")

    i = idx("const dailyQuizProgress = useMemo")
    if "computeEnVocabDailyQuizProgress(words, quizTarget)" not in lines[i + 1]:
        raise RuntimeError(f"unexpected body: {lines[i+1]!r}")
    end = i + 3
    if lines[end].strip() != ");":
        raise RuntimeError(f"unexpected close: {lines[end]!r}")
    lines.insert(end + 1, HOOK)
    print(f"+ hook after {end+1}")

    start = idx("const quizSessionRestoredRef")
    end = idx("const isWordInQuizTarget") - 1
    delete(start, end, "restore/expand/quizWordHasLevel")

    start = idx("const quizCardPreviewSession = useMemo")
    end = idx("const closeQuizCardPreview = useCallback", start)
    while "}, []);" not in lines[end]:
        end += 1
        if end - start > 20:
            raise RuntimeError("closeQuizCardPreview too long")
    delete(start, end, "preview session/close")

    start = idx("const launchTeacherQuizSession = useCallback")
    end = idx("const teacherQuizInProgress", start)
    while not lines[end].rstrip().endswith(";"):
        end += 1
    delete(start, end, "launch..teacherQuizInProgress")

    hit = idx("if (quizSession == null) setShowQuizFlashcard")
    start = hit
    while start > 0 and "useEffect(" not in lines[start]:
        start -= 1
    end = idx("const openRemarksWord = useCallback") - 1
    delete(start, end, "null-effect/resume/finish/live-poll")

    text = "".join(lines)
    if text.find("useEnVocabTeacherQuiz({") > text.find("const isWordInQuizTarget"):
        raise SystemExit("BAD ORDER")

    # Minimal safe import tweaks (exact multi-line snippets only)
    text = text.replace(
        "  EnVocabTeacherQuizIntroModal,\n"
        "  shouldShowEnVocabTeacherQuizIntro,\n"
        '} from "@/components/EnVocabTeacherQuizIntroModal";\n',
        "  EnVocabTeacherQuizIntroModal,\n"
        '} from "@/components/EnVocabTeacherQuizIntroModal";\n',
    )
    if text.count("EN_VOCAB_QUIZ_LIVE_POLL_MS") == 1:
        text = text.replace("  EN_VOCAB_QUIZ_LIVE_POLL_MS,\n", "")

    PAGE.write_text(text, encoding="utf-8")
    print(f"OK → {len(text.splitlines())} lines")


if __name__ == "__main__":
    main()
