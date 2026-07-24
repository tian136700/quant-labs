#!/usr/bin/env python3
"""Regression: deploy/commit 功能备注须「模块：改动内容」。

防复发：
- 必须带中文冒号「模块：内容」，禁止只有空话或只留冒号前半截
- 禁止用「移动端」扫全文 diff
- 禁止笼统「fix|修复|bug → 问题修复」
- 日程日期错位 →「日程管理：调整日期格式错位问题」
- 今日单词 peek →「日语单词：修复学生端获取老师正在抽查单词过慢」
- 英语抽查数量 →「英语单词：今日抽查数量不再被sync旧缓存打回」
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
MSG = ROOT / "scripts" / "git_commit_message.py"


def fail(msg: str) -> int:
    print(f"[check_feature_remark_format] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    if not MSG.is_file():
        return fail(f"missing {MSG.relative_to(ROOT)}")

    sys.path.insert(0, str(ROOT / "scripts"))
    from git_commit_message import (  # type: ignore
        FEATURE_REMARK_MAX_CHARS,
        FileChange,
        compress_feature_remark,
        format_module_feature_remark,
        _best_path_feature_remark,
        _feature_change_phrase,
        _heuristic_message,
        _PATH_FEATURE_REMARK_ALIASES,
        _DIFF_FEATURE_REMARK_ALIASES,
        summarize_feature_remark,
    )

    if FEATURE_REMARK_MAX_CHARS < 36:
        return fail("FEATURE_REMARK_MAX_CHARS must be ≥36 (allow >20 字准确描述)")

    sample = "日程管理：调整日期格式错位问题"
    if len(sample) > FEATURE_REMARK_MAX_CHARS:
        return fail("max must fit 日程管理：调整日期格式错位问题")
    if compress_feature_remark(sample) != sample:
        return fail(f"must keep 模块：内容, got {compress_feature_remark(sample)!r}")

    # 保留「功能：改了什么」时不丢后半
    kept = compress_feature_remark("日程管理：升为一级菜单，其它说明很长")
    if "升为一级" not in kept or "：" not in kept:
        return fail(f"compress must keep 功能：改动, got {kept!r}")
    if len(kept) > FEATURE_REMARK_MAX_CHARS:
        return fail(f"compressed remark too long: {kept!r}")

    truncated = compress_feature_remark(
        "日程管理：" + ("这是一段很长的改动说明" * 5)
    )
    if "：" not in truncated:
        return fail("long remark must still contain ：")
    if not truncated.startswith("日程管理："):
        return fail(f"long remark must keep feature prefix, got {truncated!r}")
    if len(truncated) > FEATURE_REMARK_MAX_CHARS:
        return fail(f"long remark must be ≤max, got {truncated!r}")

    # format helper：无冒号正文须自动加模块
    auto = format_module_feature_remark("英语单词", "今日抽查数量不再被sync旧缓存打回")
    if not auto.startswith("英语单词："):
        return fail(f"format_module_feature_remark must prefix module, got {auto!r}")
    if "今日抽查数量" not in auto:
        return fail(f"format_module_feature_remark must keep body, got {auto!r}")

    src = MSG.read_text(encoding="utf-8")
    if re.search(
        r'for sep in \([^)]*"："[^)]*\):[\s\S]{0,120}raw\.split\(sep,\s*1\)\[0\]',
        src,
    ):
        return fail("compress must not discard text after ：")
    if "_is_self_contained_remark" in src:
        return fail("must not skip 模块： prefix via _is_self_contained_remark")
    if "format_module_feature_remark" not in src:
        return fail("summarize must use format_module_feature_remark")

    if re.search(r'mobile\\.css\|移动端|"移动端"', src):
        return fail("must not alias on bare 移动端 (docs false-positive)")
    if "_SHORT_FEATURE_ALIASES" in src:
        return fail("old _SHORT_FEATURE_ALIASES must be removed (path/diff split)")
    if re.search(r'r"fix\|修复\|bug".{0,40}问题修复', src, re.S):
        return fail("must not map bare fix|修复|bug to 问题修复")
    if "FEATURE_REMARK_MAX_CHARS = 20" in src:
        return fail("must not hard-cap remarks at 20 chars")

    for pattern, short in _PATH_FEATURE_REMARK_ALIASES:
        if len(short) > FEATURE_REMARK_MAX_CHARS:
            return fail(f"path alias >max chars: {short!r}")
    for pattern, short in _DIFF_FEATURE_REMARK_ALIASES:
        if len(short) > FEATURE_REMARK_MAX_CHARS:
            return fail(f"diff alias >max chars: {short!r}")

    # 日程升一级
    schedule_changes = [
        FileChange(path="src/lib/site-nav-config.ts", status="M"),
        FileChange(path="docs/feature-index.md", status="M"),
        FileChange(path=".cursor/rules/site-nav-pin-freq.mdc", status="M"),
    ]
    schedule_diff = (
        '+export const NAV_TOP_LEVEL_CROSS_SUBJECT_IDS = ["jpLessonSchedule"] as const;\n'
        '+  "jpLessonSchedule",\n'
        "+日程管理（顶栏一级模块）\n"
        "+不挂在「日语」二级下\n"
        " 手机端状态 Tab 记忆\n"
        " 移动端卡片布局\n"
        "+修 bug：导航\n"
    )
    phrase = _feature_change_phrase(schedule_changes, schedule_diff)
    if "一级" not in (phrase or ""):
        return fail(f"schedule nav phrase expected 一级, got {phrase!r}")

    long_msg = _heuristic_message(schedule_changes, schedule_diff)
    short = compress_feature_remark(long_msg)
    if "移动端" in short:
        return fail(f"schedule remark must not become 移动端适配, got {short!r}")
    if "问题修复" in short:
        return fail(f"schedule remark must not become 问题修复, got {short!r}")
    if len(short) > FEATURE_REMARK_MAX_CHARS:
        return fail(f"schedule remark >max: {short!r}")

    # 日期错位 → 模块：内容
    date_changes = [
        FileChange(path="src/app/globals/globals-jp-lesson-schedule.css", status="M"),
        FileChange(path="scripts/check_jp_lesson_schedule_css.py", status="M"),
    ]
    with mock.patch(
        "git_commit_message.worktree_changes", return_value=date_changes
    ), mock.patch(
        "git_commit_message.worktree_diff_excerpt",
        return_value="+jpls-date-input\n+日期格式错位\n",
    ):
        date_remark = summarize_feature_remark()
    if "日程管理：" not in date_remark or "日期格式错位" not in date_remark:
        return fail(
            f"date remark expected 日程管理：…日期格式错位…, got {date_remark!r}"
        )
    if "问题修复" in date_remark or "日语新课" in date_remark:
        return fail(f"date remark must not be vague: {date_remark!r}")

    # peek / live → 须带模块冒号
    peek_changes = [
        FileChange(path="src/hooks/useJpVocabTeacherQuiz.ts", status="M"),
        FileChange(path="src/components/JpVocabStudyPage.tsx", status="M"),
        FileChange(path="src/lib/vocab-teacher-quiz-live-sync.ts", status="A"),
        FileChange(path="docs/feature-index.md", status="M"),
    ]
    with mock.patch(
        "git_commit_message.worktree_changes", return_value=peek_changes
    ), mock.patch(
        "git_commit_message.worktree_diff_excerpt",
        return_value="+putVocabTeacherQuizLiveWord\n+修复：获取不到\n",
    ):
        peek_remark = summarize_feature_remark()
    if "：" not in peek_remark:
        return fail(f"peek remark must be 模块：内容, got {peek_remark!r}")
    if "获取老师正在抽查" not in peek_remark:
        return fail(f"peek remark should describe 获取老师抽查词, got {peek_remark!r}")
    if "问题修复" in peek_remark:
        return fail(f"peek remark must not be 问题修复: {peek_remark!r}")

    # 英语今日抽查数量 stale sync
    en_target_changes = [
        FileChange(path="src/hooks/useEnVocabAdminActions.ts", status="M"),
        FileChange(path="src/hooks/useEnVocabPageSync.ts", status="M"),
        FileChange(path="src/lib/en-vocab-teacher-visible.ts", status="M"),
        FileChange(
            path=".cursor/rules/vocab-quiz-target-no-stale-sync.mdc", status="A"
        ),
    ]
    with mock.patch(
        "git_commit_message.worktree_changes", return_value=en_target_changes
    ), mock.patch(
        "git_commit_message.worktree_diff_excerpt",
        return_value="+shouldRejectStaleEnVocabTeacherVisibleLimit\n+bypassCache\n",
    ):
        en_remark = summarize_feature_remark()
    if not en_remark.startswith("英语单词："):
        return fail(f"en quiz-target remark must start with 英语单词：, got {en_remark!r}")
    if "抽查数量" not in en_remark:
        return fail(f"en quiz-target remark should mention 抽查数量, got {en_remark!r}")

    vague = _feature_change_phrase(
        [FileChange(path="src/components/JpVocabPage.tsx", status="M")],
        "+修复显示问题\n+fix bug\n",
    )
    if vague == "问题修复":
        return fail("bare 修复/fix in diff must not become 问题修复")

    print("[check_feature_remark_format] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
