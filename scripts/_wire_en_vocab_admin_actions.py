#!/usr/bin/env python3
"""Wire useEnVocabAdminActions into EnVocabPage."""
from __future__ import annotations

from pathlib import Path

PAGE = Path(__file__).resolve().parents[1] / "src/components/EnVocabPage.tsx"

HOOK = """
  const {
    resetting,
    showResetChoice,
    setShowResetChoice,
    quizTargetInput,
    setQuizTargetInput,
    settingQuizTarget,
    exporting,
    deletingBatch,
    selectedDeleteIds,
    setDailyQuizTarget,
    openResetChoice,
    resetToday,
    resetAll,
    exportExcel,
    toggleDeleteSelection,
    toggleSelectAllPageForDelete,
    batchDeleteSelected,
    deleteWord,
  } = useEnVocabAdminActions({
    locale,
    isAdminMode,
    canOperate,
    openEnAuth,
    setStatus,
    setError,
    words,
    refs,
    refsRef,
    displayOrderRef,
    teacherVisibleLimit,
    highlightId,
    editingWord,
    setWords,
    setDisplayOrder,
    setSharedTodayWordIds,
    setTeacherVisibleLimit,
    setSessionLevel,
    setSessionUsageLevels,
    setSessionReviewAt,
    setHighlightId,
    setEditingWord,
    setUseDailyRowOrder,
    setStatSort,
    setPage,
  });

"""


def main() -> None:
    raw = PAGE.read_text(encoding="utf-8")
    if "useEnVocabAdminActions({" in raw:
        raise SystemExit("already wired admin")

    lines = raw.splitlines(keepends=True)

    def idx(substr: str, start: int = 0) -> int:
        for i in range(start, len(lines)):
            if substr in lines[i]:
                return i
        raise RuntimeError(f"missing: {substr!r} from {start}")

    def delete(start: int, end_inclusive: int, label: str) -> None:
        del lines[start : end_inclusive + 1]
        print(f"- {label} ({start+1}..{end_inclusive+1})")

    # import
    i = idx('useEnVocabTeacherQuiz } from "@/hooks/useEnVocabTeacherQuiz"')
    lines.insert(
        i + 1,
        'import { useEnVocabAdminActions } from "@/hooks/useEnVocabAdminActions";\n',
    )
    print("+ import")

    # Remove admin states — do from bottom to top so indices stay valid... 
    # Actually do one pass collecting ranges then delete reverse.

    ranges: list[tuple[int, int, str]] = []

    # resetting
    i = idx("const [resetting, setResetting]")
    ranges.append((i, i, "resetting state"))

    # showResetChoice
    i = idx("const [showResetChoice, setShowResetChoice]")
    ranges.append((i, i, "showResetChoice state"))

    # quizTargetInput multi-line
    i = idx("const [quizTargetInput, setQuizTargetInput]")
    end = i
    while ");" not in lines[end]:
        end += 1
    ranges.append((i, end, "quizTargetInput state"))

    # settingQuizTarget
    i = idx("const [settingQuizTarget, setSettingQuizTarget]")
    ranges.append((i, i, "settingQuizTarget state"))

    # exporting
    i = idx("const [exporting, setExporting]")
    ranges.append((i, i, "exporting state"))

    # deletingBatch
    i = idx("const [deletingBatch, setDeletingBatch]")
    ranges.append((i, i, "deletingBatch state"))

    # selectedDeleteIds
    i = idx("const [selectedDeleteIds, setSelectedDeleteIds]")
    end = i
    while ");" not in lines[end]:
        end += 1
    ranges.append((i, end, "selectedDeleteIds state"))

    # quizTargetInput sync effect
    i = idx("setQuizTargetInput(String(teacherVisibleLimit.quiz_target))")
    # back to useEffect
    start = i
    while start > 0 and "useEffect(" not in lines[start]:
        start -= 1
    end = i
    while "}, [" not in lines[end] and end < start + 10:
        end += 1
    # include closing of effect
    while end < len(lines) and "]);" not in lines[end]:
        end += 1
    ranges.append((start, end, "quizTargetInput sync effect"))

    for start, end, label in sorted(ranges, key=lambda x: -x[0]):
        delete(start, end, label)

    # Insert hook after review-lock timer effect (after sync), before toggleStatSort
    i = idx("setInterval(() => setReviewLockNow(Date.now())")
    # find end of that useEffect
    end = i
    while "}, []);" not in lines[end]:
        end += 1
        if end - i > 15:
            raise RuntimeError("review lock effect too long")
    insert_at = end + 1
    lines.insert(insert_at, HOOK)
    print(f"+ admin hook after {end+1}")

    # Delete setDailyQuizTarget .. resetAll (before pickNext)
    start = idx("const setDailyQuizTarget = async")
    end = idx("const pickNext = () =>") - 1
    delete(start, end, "setDaily..resetAll")

    # Delete exportExcel function (before openRefPreview)
    start = idx("const exportExcel = async")
    end = idx("const openRefPreview =", start) - 1
    delete(start, end, "exportExcel")

    # Delete toggleDeleteSelection .. deleteWord (before if (checking))
    start = idx("const toggleDeleteSelection =")
    end = idx("if (checking)", start) - 1
    # walk back over blank lines is fine
    delete(start, end, "toggle/delete handlers")

    text = "".join(lines)

    # sanity
    for must in [
        "useEnVocabAdminActions({",
        "const pickNext",
        "const openRefPreview",
        "const handleWordAdded",
        "selectedDeleteIds",
        "setDailyQuizTarget",
    ]:
        if must not in text:
            raise SystemExit(f"missing {must}")

    # hook must appear before selectedDeleteIds consumers that aren't the destructure
    hook_at = text.find("useEnVocabAdminActions({")
    # first use of selectedDeleteIds.has after hook
    PAGE.write_text(text, encoding="utf-8")
    print(f"OK → {len(text.splitlines())} lines")


if __name__ == "__main__":
    main()
