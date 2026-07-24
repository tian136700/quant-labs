#!/usr/bin/env python3
"""Regression: deploy/commit 功能备注须为「功能：改了什么」且 ≤20 字。

防复发：
- 禁止只保留冒号前半截（旧 compress 会把「日程管理：升为一级」压成「日程管理」）
- 禁止用「移动端」扫全文 diff（易把导航改动误写成「移动端适配」）
- 禁止笼统「fix|修复|bug → 问题修复」（Bark 变成空话）
- 今日单词 peek / live 同步须落到「今日单词：获取当前词」
- 日程升一级等须落到准确短句
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
        _best_path_feature_remark,
        _feature_change_phrase,
        _heuristic_message,
        _PATH_FEATURE_REMARK_ALIASES,
        _DIFF_FEATURE_REMARK_ALIASES,
        summarize_feature_remark,
    )

    if FEATURE_REMARK_MAX_CHARS != 20:
        return fail("FEATURE_REMARK_MAX_CHARS must be 20")

    # 保留「功能：改了什么」
    kept = compress_feature_remark("日程管理：升为一级菜单，其它说明很长")
    if kept != "日程管理：升为一级菜单":
        return fail(f"compress must keep 功能：改动, got {kept!r}")
    if len(kept) > 20:
        return fail(f"compressed remark too long: {kept!r}")

    truncated = compress_feature_remark(
        "日程管理：这是一段非常非常非常长的改动说明需要截断"
    )
    if "：" not in truncated:
        return fail("long remark must still contain ：")
    if not truncated.startswith("日程管理："):
        return fail(f"long remark must keep feature prefix, got {truncated!r}")
    if len(truncated) > 20:
        return fail(f"long remark must be ≤20, got {truncated!r} len={len(truncated)}")

    # 禁止旧逻辑：只留冒号左侧
    src = MSG.read_text(encoding="utf-8")
    if re.search(
        r'for sep in \([^)]*"："[^)]*\):[\s\S]{0,120}raw\.split\(sep,\s*1\)\[0\]',
        src,
    ):
        return fail("compress must not discard text after ：")

    # 禁止「移动端」扫全文
    if re.search(r'mobile\\.css\|移动端|"移动端"', src):
        return fail("must not alias on bare 移动端 (docs false-positive)")
    if "_SHORT_FEATURE_ALIASES" in src:
        return fail("old _SHORT_FEATURE_ALIASES must be removed (path/diff split)")

    # 禁止笼统「问题修复」别名
    if re.search(r'r"fix\|修复\|bug".{0,40}问题修复', src, re.S):
        return fail("must not map bare fix|修复|bug to 问题修复")

    # path aliases 须已是 功能：改动
    for pattern, short in _PATH_FEATURE_REMARK_ALIASES:
        if "：" not in short:
            return fail(f"path alias must use 功能：改动 format: {short!r}")
        if len(short) > 20:
            return fail(f"path alias >20 chars: {short!r}")

    for pattern, short in _DIFF_FEATURE_REMARK_ALIASES:
        if "：" not in short:
            return fail(f"diff alias must use 功能：改动 format: {short!r}")
        if len(short) > 20:
            return fail(f"diff alias >20 chars: {short!r}")

    # 日程升一级：diff 命中
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
        # 干扰项：文档里常有「移动端」，旧逻辑会误写成「移动端适配」
        " 手机端状态 Tab 记忆\n"
        " 移动端卡片布局\n"
        # 干扰项：旧逻辑会把任意「修复」收成「问题修复」
        "+修 bug：导航\n"
    )
    phrase = _feature_change_phrase(schedule_changes, schedule_diff)
    if phrase != "升为一级菜单":
        return fail(f"schedule nav phrase expected 升为一级菜单, got {phrase!r}")

    long_msg = _heuristic_message(schedule_changes, schedule_diff)
    short = compress_feature_remark(long_msg)
    if not short.startswith("日程管理："):
        return fail(f"schedule remark should start with 日程管理：, got {short!r}")
    if "移动端" in short:
        return fail(f"schedule remark must not become 移动端适配, got {short!r}")
    if "问题修复" in short:
        return fail(f"schedule remark must not become 问题修复, got {short!r}")
    if len(short) > 20:
        return fail(f"schedule remark >20: {short!r}")

    # 仅有文档提到移动端、无 mobile.css 路径时，不得压成「移动端适配」
    docs_only = compress_feature_remark("日语新课：手机端状态Tab记忆与移动端布局")
    if docs_only == "移动端适配" or docs_only.endswith("移动端适配"):
        return fail(f"docs mentioning 移动端 must not alias to 移动端适配: {docs_only!r}")
    if "：" not in docs_only:
        return fail(f"docs remark should keep 功能：改动, got {docs_only!r}")

    # 今日单词 peek / live：路径权重优先，不要写成「日语新课：问题修复」
    peek_changes = [
        FileChange(path="src/hooks/useJpVocabTeacherQuiz.ts", status="M"),
        FileChange(path="src/components/JpVocabStudyPage.tsx", status="M"),
        FileChange(path="src/lib/vocab-teacher-quiz-live-sync.ts", status="A"),
        FileChange(path="src/app/api/jp-vocab/teacher-quiz-live/route.ts", status="M"),
        FileChange(path="docs/feature-index.md", status="M"),
        FileChange(path=".cursor/rules/vocab-teacher-quiz-live-sync.mdc", status="A"),
        FileChange(path="scripts/check_vocab_teacher_quiz_live_sync.py", status="A"),
    ]
    peek_alias = _best_path_feature_remark(peek_changes)
    if peek_alias != "今日单词：获取当前词":
        return fail(f"peek path alias expected 今日单词：获取当前词, got {peek_alias!r}")

    with mock.patch(
        "git_commit_message.worktree_changes", return_value=peek_changes
    ), mock.patch(
        "git_commit_message.worktree_diff_excerpt",
        return_value=(
            "+putVocabTeacherQuizLiveWord\n"
            "+teacherQuizLiveSyncedIdRef\n"
            "+修复：学生获取不到老师正在抽查的词\n"
            "+bug fix retry\n"
        ),
    ):
        peek_remark = summarize_feature_remark()
    if peek_remark != "今日单词：获取当前词":
        return fail(f"peek remark expected 今日单词：获取当前词, got {peek_remark!r}")
    if "问题修复" in peek_remark or "日语新课" in peek_remark:
        return fail(f"peek remark must not be vague 问题修复/日语新课: {peek_remark!r}")

    # 纯「修复」字样的 diff 不得再落到「问题修复」
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
