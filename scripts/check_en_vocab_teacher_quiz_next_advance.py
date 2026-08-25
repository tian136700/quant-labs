#!/usr/bin/env python3
"""Regression: EN teacher quiz「下一个」must never soft-lock (blocking quiz bug).

Historical failure modes:
1) pendingNext reset on whole word / updated_at → optimistic save clears pending → no advance
2) wait only for selectedLevel when usage drafts are already complete → never advance
3) wordHasLevel ignores session usage draft complete → advance thinks current still unchecked
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODAL = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"
ADVANCE = ROOT / "src/components/en-vocab-teacher-quiz-flashcard/advanceTeacherQuizNext.ts"
REVIEW_ACTIONS = ROOT / "src/hooks/useEnVocabReviewActions.ts"
RULE = ROOT / ".cursor/rules/en-vocab-teacher-quiz-next-must-advance.mdc"


def main() -> int:
    errors: list[str] = []

    for path, label in (
        (MODAL, "flashcard modal"),
        (ADVANCE, "advanceTeacherQuizNext"),
        (REVIEW_ACTIONS, "useEnVocabReviewActions"),
        (RULE, "alwaysApply rule"),
    ):
        if not path.is_file():
            errors.append(f"missing {label}: {path}")

    if errors:
        print("check_en_vocab_teacher_quiz_next_advance: FAIL", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    modal = MODAL.read_text(encoding="utf-8")
    advance = ADVANCE.read_text(encoding="utf-8")
    actions = REVIEW_ACTIONS.read_text(encoding="utf-8")
    rule = RULE.read_text(encoding="utf-8")

    # --- pendingNext reset deps ---
    # Find the effect that clears pendingNextAfterIdleRef (reset on open/word change)
    reset_hits = [
        m.start()
        for m in re.finditer(r"pendingNextAfterIdleRef\.current\s*=\s*false", modal)
    ]
    if not reset_hits:
        errors.append("modal: missing pendingNextAfterIdleRef.current = false")
    else:
        # First clear in the open/word effect should be near deps [open, word?.id]
        window = modal[max(0, reset_hits[0] - 80) : reset_hits[0] + 280]
        # The reset effect ends with }, [open, word?.id]);
        deps_ok = False
        # Search forward from first reset for the effect deps within ~400 chars
        after = modal[reset_hits[0] : reset_hits[0] + 450]
        if re.search(r"\},\s*\[open,\s*word\?\.id\]\s*\)", after):
            deps_ok = True
        if not deps_ok:
            errors.append(
                "modal: pendingNext reset effect deps must be exactly [open, word?.id]"
            )
        # Within that same early window, forbid updated_at / , word]
        if "word?.updated_at" in after[:350] or re.search(
            r"\},\s*\[[^\]]*word[^\]]*\]", after[:350]
        ):
            # allow word?.id only
            if "word?.updated_at" in after[:350] or ", word]" in after[:350]:
                errors.append(
                    "modal: pendingNext reset must not depend on word / updated_at"
                )

    # --- tryGoNext must not dead-wait on selected ---
    if "const tryGoNext" not in modal:
        errors.append("modal: missing tryGoNext")
    else:
        # Rough extract tryGoNext body
        start = modal.find("const tryGoNext")
        end = modal.find("return createPortal", start)
        body = modal[start:end] if end > start else modal[start : start + 2500]
        if "areEnVocabUsageLevelsComplete(usageDraftLevels, usageSlotCount)" not in body:
            errors.append("tryGoNext: must detect usagesComplete from usage draft")
        if "onSelectUsageLevels(w.id, usageDraftLevels)" not in body:
            errors.append(
                "tryGoNext: usages complete + no selected must retry onSelectUsageLevels"
            )
        if "void runShareThenAdvance()" not in body:
            errors.append(
                "tryGoNext: usages complete must call runShareThenAdvance "
                "(not only pendingNext + wait for selected)"
            )
        # Ban the old soft-lock pattern: if (!selected) { pending...; return } without usagesComplete escape
        if re.search(
            r"if\s*\(\s*!selected\s*\)\s*\{[^}]*pendingNextAfterIdleRef\.current\s*=\s*true[^}]*return",
            body,
            re.DOTALL,
        ):
            errors.append(
                "tryGoNext: must not pending+return on !selected alone "
                "(usagesComplete must still advance)"
            )

    # --- wordHasLevel must honor usage draft complete ---
    wh_start = modal.find("const wordHasLevel")
    if wh_start < 0:
        errors.append("modal: missing wordHasLevel")
    else:
        wh_body = modal[wh_start : wh_start + 900]
        if "areEnVocabUsageLevelsComplete" not in wh_body:
            errors.append(
                "wordHasLevel: must treat session usage draft complete as checked"
            )
        if "sessionUsageLevels" not in wh_body:
            errors.append("wordHasLevel: must read sessionUsageLevels draft")

    # --- same-tick advance ---
    if "currentUsagesComplete" not in modal:
        errors.append(
            "runAdvanceAfterShare: missing currentUsagesComplete "
            "(same-tick draft may lag sessionUsageLevels)"
        )
    # saveBusy / share busy 须 pending；真失败须清 pending（勿自动死循环）
    if "ok === \"busy\"" not in modal and "ok === 'busy'" not in modal:
        errors.append(
            "modal: must distinguish share result busy vs failure (ok === \"busy\")"
        )
    if "pendingNextAfterIdleRef.current = true" not in modal:
        errors.append("saveBusy / share busy must re-set pendingNext")
    if (
        "pendingNextAfterIdleRef.current = false" not in modal
        or "勿自动死循环" not in modal
    ):
        # comment + clear pending on real failure
        fail_clear = (
            "pendingNextAfterIdleRef.current = false" in modal
            and "ok === \"busy\"" in modal
        )
        if not fail_clear:
            errors.append(
                "modal: share real failure must clear pendingNext (no auto-retry loop)"
            )

    # share fetch 硬超时
    if "AbortSignal.timeout(EN_VOCAB_SHARE_FETCH_TIMEOUT_MS)" not in actions:
        errors.append(
            "useEnVocabReviewActions.shareWord: must AbortSignal.timeout(EN_VOCAB_SHARE_FETCH_TIMEOUT_MS)"
        )
    if 'return "busy"' not in actions:
        errors.append(
            "useEnVocabReviewActions.shareWord: concurrent save/share must return \"busy\""
        )
    if "syncWaitFailed" not in modal:
        errors.append(
            "modal: must surface syncWaitFailed overlay when share times out/fails"
        )
    alerts = ROOT / "src/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardAlerts.tsx"
    if alerts.is_file():
        alerts_src = alerts.read_text(encoding="utf-8")
        if "syncWaitFailed" not in alerts_src:
            errors.append("EnVocabFlashcardAlerts: must accept syncWaitFailed prop")
        if "同步失败或超时" not in alerts_src:
            errors.append("EnVocabFlashcardAlerts: must show retry copy on syncWaitFailed")
    # --- draftComplete in pending effect ---
    if "draftComplete" not in modal:
        errors.append(
            "pendingNext effect: must allow draftComplete without selectedLevel"
        )
    if "selectedLevel == null && !draftComplete" not in modal:
        errors.append(
            "pendingNext effect: must continue when draftComplete even if selectedLevel null"
        )

    # --- save failure must keep complete draft ---
    if "setSessionUsageLevels((prev) => ({ ...prev, [wordId]: complete }))" not in actions:
        errors.append(
            "useEnVocabReviewActions: on save failure must keep complete usage draft"
        )
    if "if (prevUsage) next[wordId] = prevUsage" in actions:
        errors.append(
            "useEnVocabReviewActions: must not roll back usage draft to prevUsage on failure"
        )

    # --- advance helper still exported ---
    if "export function advanceEnVocabTeacherQuizNext" not in advance:
        errors.append("advanceTeacherQuizNext.ts: missing export")

    # --- rule must stay alwaysApply ---
    if "alwaysApply: true" not in rule:
        errors.append("en-vocab-teacher-quiz-next-must-advance.mdc must be alwaysApply")
    if "pendingNext" not in rule or "runShareThenAdvance" not in rule:
        errors.append("rule must document pendingNext + runShareThenAdvance invariants")

    if errors:
        print("check_en_vocab_teacher_quiz_next_advance: FAIL", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("check_en_vocab_teacher_quiz_next_advance: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
