#!/usr/bin/env python3
"""Regression: EN share must require today's familiarity check (today_check).

Symptom: student shared list = 25, admin progress = 19/30 remaining 11
because「下一个」shared before level POST succeeded.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARE = ROOT / "src/lib/en-vocab-db/share.ts"
ROUTE = ROOT / "src/app/api/en-vocab/share/route.ts"
ACTIONS = ROOT / "src/hooks/useEnVocabReviewActions.ts"
MODAL = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"
RULE = ROOT / ".cursor/rules/en-vocab-share-requires-review.mdc"
DOC = ROOT / "docs/en-vocab-share-api.txt"


def main() -> int:
    errors: list[str] = []

    for path, label in (
        (SHARE, "share.ts"),
        (ROUTE, "share/route.ts"),
        (ACTIONS, "useEnVocabReviewActions"),
        (MODAL, "flashcard modal"),
        (RULE, "rule"),
        (DOC, "api txt"),
    ):
        if not path.is_file():
            errors.append(f"missing {label}: {path}")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1

    share = SHARE.read_text(encoding="utf-8")
    route = ROUTE.read_text(encoding="utf-8")
    actions = ACTIONS.read_text(encoding="utf-8")
    modal = MODAL.read_text(encoding="utf-8")
    rule = RULE.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    if "hasEnVocabTodayCheckCounted" not in share:
        errors.append("shareEnVocabWord: must gate on hasEnVocabTodayCheckCounted")
    if 'error: "review_required"' not in share and "review_required" not in share:
        errors.append("shareEnVocabWord: must return review_required when unchecked")
    if "review_required" not in route:
        errors.append("share route: must map review_required to client message")
    if "请先勾选熟悉程度" not in route:
        errors.append("share route: zh message for review_required")

    if "hasEnVocabTodayCheckCounted" not in actions:
        errors.append("shareWord client: must require today_check / review today")
    if "Promise<boolean>" not in actions:
        errors.append("recordUsageLevels/recordLevel: must return Promise<boolean>")

    if "await onSelectUsageLevels(w.id, usageDraftLevels)" not in modal:
        errors.append("tryGoNext: must await usage level save before share")
    if "enVocabOpFailDetail(saved)" not in modal:
        errors.append(
            "tryGoNext: must stop when save fails (enVocabOpFailDetail), not only saved === false"
        )

    if "review_required" not in rule or "today_check" not in rule:
        errors.append("rule must document review_required / today_check gate")
    if "review_required" not in doc and "熟悉程度" not in doc:
        errors.append("docs/en-vocab-share-api.txt must document review gate")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1

    print("OK: en-vocab share requires today's review before shared")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
