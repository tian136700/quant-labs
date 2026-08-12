#!/usr/bin/env python3
"""回归：日语抽查熟悉程度须一点就亮，禁止保存中冲淡 / 门禁丢勾选。"""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    modal = (ROOT / "src/components/JpVocabTeacherQuizFlashcardModal.tsx").read_text(
        encoding="utf-8"
    )
    if "useJpVocabFlashcardLevelDraft" not in modal:
        errors.append("modal must use useJpVocabFlashcardLevelDraft")
    if "paintLevel(lv.key)" not in modal:
        errors.append("modal must paintLevel before onSelectLevel")
    if "previewMode || isCoach || reviewLocked || isSaving" in modal:
        errors.append("levelDisabled must not include isSaving")
    if "previewMode || isCoach || reviewLocked" not in modal:
        errors.append("levelDisabled should still lock preview/coach/reviewLocked")

    actions = (ROOT / "src/hooks/useJpVocabReviewActions.ts").read_text(encoding="utf-8")
    if "pendingLevelByWordRef" not in actions:
        errors.append("review actions need pendingLevelByWordRef")
    # optimistic sessionLevel must appear before wordSyncState early-return
    idx_session = actions.find("setSessionLevel((prev) => ({ ...prev, [wordId]: level }))")
    idx_guard = actions.find("if (wordSyncState[wordId])")
    if idx_session < 0 or idx_guard < 0 or idx_session > idx_guard:
        errors.append("setSessionLevel must run before wordSyncState guard in recordLevel")
    if 'setStatus("正在提交，请勿重复提交")' in actions.split("const recordLevel")[1].split(
        "const tryRecordLevel"
    )[0]:
        errors.append("recordLevel must not early-return 请勿重复提交 without optimistic UI")

    notes = (
        ROOT / "src/hooks/useJpVocabFlashcardClassNotesFetch.ts"
    ).read_text(encoding="utf-8")
    if "onWordUpdated?.(merged)" in notes:
        errors.append(
            "class-notes fetch must not onWordUpdated(merged) — clobbers optimistic level"
        )

    styles = (
        ROOT / "src/components/JpVocabTeacherQuizFlashcardStyles.tsx"
    ).read_text(encoding="utf-8")
    if "level-opt.is-checked.is-saving" not in styles and (
        "level-opt.is-checked:disabled" not in styles
    ):
        errors.append("flashcard styles must keep is-checked at opacity 1 while saving")

    rule = ROOT / ".cursor/rules/jp-vocab-level-click-once.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/jp-vocab-level-click-once.mdc")

    if errors:
        print("check_jp_vocab_level_click_once FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_jp_vocab_level_click_once: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
