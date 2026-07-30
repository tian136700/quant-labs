#!/usr/bin/env python3
"""管理员勾「非常熟悉」不占今日名额、老师池往后补。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needle: str, msg: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        raise AssertionError(f"{path.relative_to(ROOT)}: {msg}\n  missing: {needle!r}")


def main() -> int:
    review = ROOT / "src/lib/jp-vocab-review.ts"
    visible = ROOT / "src/lib/jp-vocab-teacher-visible.ts"
    review_db = ROOT / "src/lib/jp-vocab-db/review_record.ts"
    route = ROOT / "src/app/api/jp-vocab/route.ts"
    hook = ROOT / "src/hooks/useJpVocabReviewActions.ts"
    helpers = ROOT / "src/lib/jp-vocab-page-helpers.ts"
    page = ROOT / "src/components/JpVocabPage.tsx"

    must_contain(review, "isJpVocabAdminVerySkipToday", "须有管理员 very 跳过判定")
    must_contain(review, "countTowardDailyQuiz", "applyJpVocabReview 须支持不占名额")
    must_contain(
        review,
        "if (!countTowardDailyQuiz)",
        "不占名额时不得 nextTodayCheckCount",
    )

    must_contain(visible, "isJpVocabAdminVerySkipToday", "可见池须排除管理员 very 跳过")
    must_contain(
        visible,
        "jpVocabTeacherVisiblePoolHasAdminVerySkip",
        "池内挂着 skip 词须重算",
    )

    must_contain(review_db, "countTowardDailyQuiz", "recordJpVocabReview 须传不占名额")
    must_contain(
        review_db,
        "rematerializeJpVocabTeacherVisibleAfterAdminVerySkip",
        "管理员 skip 后须重算老师池",
    )

    must_contain(
        route,
        'isAdminForReview && level === "very"',
        "仅管理员+very 才不占名额",
    )
    must_contain(route, "countTowardDailyQuiz", "API 须传 countTowardDailyQuiz")

    must_contain(
        hook,
        'isAdminMode && level === "very"',
        "客户端乐观更新须与管理员 skip 一致",
    )
    must_contain(hook, "setTeacherVisibleLimit", "skip 后须更新老师可见池")
    must_contain(helpers, "countTowardDailyQuiz", "bumpJpVocabWordReview 须支持 options")
    must_contain(page, "setTeacherVisibleLimit", "JpVocabPage 须把 setTeacherVisibleLimit 传给 hook")

    print("ok: jp-vocab admin very skip quota")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as e:
        print(f"FAIL: {e}", file=sys.stderr)
        raise SystemExit(1)
