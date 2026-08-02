#!/usr/bin/env python3
"""Regression: Bark 备注须 Agent/AI 动态总结，禁止路径写死改动文案。"""
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
        AGENT_FEATURE_REMARK_FILE,
        FEATURE_REMARK_MAX_CHARS,
        FileChange,
        _PATH_FEATURE_REMARK_ALIASES,
        _DIFF_FEATURE_REMARK_ALIASES,
        _area_label,
        _modules_list_remark,
        clear_agent_feature_remark,
        compress_feature_remark,
        format_module_feature_remark,
        read_agent_feature_remark,
        summarize_feature_remark,
    )

    if FEATURE_REMARK_MAX_CHARS < 36:
        return fail("FEATURE_REMARK_MAX_CHARS must be ≥36")

    if _PATH_FEATURE_REMARK_ALIASES or _DIFF_FEATURE_REMARK_ALIASES:
        return fail(
            "path/diff feature aliases must stay empty "
            "(no hardcoded 修复某某; use Agent/AI)"
        )

    sample = "英语抽背-老师端：备注挪到释义下方"
    if compress_feature_remark(sample) != sample:
        return fail(f"must keep 模块：内容, got {compress_feature_remark(sample)!r}")

    auto = format_module_feature_remark("英语抽背-老师端", "备注挪到释义下方")
    if not auto.startswith("英语抽背-老师端："):
        return fail(f"format must prefix module, got {auto!r}")

    if _area_label("src/app/en-vocab/page.tsx") != "英语抽背-老师端":
        return fail("en-vocab teacher must map to 英语抽背-老师端")
    if _area_label("src/app/en-vocab/admin/page.tsx") != "英语抽背-管理员端":
        return fail("en-vocab admin must map to 英语抽背-管理员端")
    if _area_label("src/app/jp-vocab/page.tsx") != "日语抽问-老师端":
        return fail("jp-vocab teacher must map to 日语抽问-老师端")

    src = MSG.read_text(encoding="utf-8")
    if "read_agent_feature_remark" not in src:
        return fail("summarize must read agent_feature_remark.txt")
    if "_ai_feature_remark" not in src:
        return fail("summarize must try AI before module-only fallback")
    if "_ai_chat_for_git" not in src or "OLLAMA_BASE_URL" not in src:
        return fail("AI remark must support local Ollama when OPENAI_API_KEY missing")
    if "_is_weak_feature_remark" not in src:
        return fail("must skip weak agent remarks like 改动了模块 so AI can run")
    if "_modules_list_remark" not in src:
        return fail("summarize must fall back to 改动了模块")
    if re.search(r'r"fix\|修复\|bug".{0,40}问题修复', src, re.S):
        return fail("must not map bare fix|修复|bug to 问题修复")
    if "FEATURE_REMARK_MAX_CHARS = 20" in src:
        return fail("must not hard-cap remarks at 20 chars")

    # 弱 Agent 备注（改动了模块）不得挡住 AI
    from git_commit_message import _is_weak_feature_remark  # type: ignore

    if not _is_weak_feature_remark("改动了日语抽问-老师端"):
        return fail("改动了模块 must be weak")
    if _is_weak_feature_remark("日语抽问-老师端：用法旁显示口语考试分"):
        return fail("concrete agent remark must not be weak")

    AGENT_FEATURE_REMARK_FILE.parent.mkdir(parents=True, exist_ok=True)
    AGENT_FEATURE_REMARK_FILE.write_text("改动了日语抽问-老师端\n", encoding="utf-8")
    try:
        with mock.patch(
            "git_commit_message.worktree_changes",
            return_value=[
                FileChange(
                    path="src/components/JpVocabTeacherQuizFlashcardModal.tsx",
                    status="M",
                ),
            ],
        ), mock.patch(
            "git_commit_message.worktree_diff_excerpt",
            return_value="+口语 7/10 · 考试 8/10\n",
        ), mock.patch(
            "git_commit_message._ai_feature_remark",
            return_value="日语抽问-老师端：用法旁显示口语考试分",
        ):
            remark = summarize_feature_remark()
        if "口语" not in remark and "用法" not in remark:
            return fail(f"weak agent 改动了… must fall through to AI, got {remark!r}")
        if remark.startswith("改动了"):
            return fail(f"AI should win over weak agent file, got {remark!r}")
    finally:
        clear_agent_feature_remark()

    # 兜底：改动了模块
    counts = {"英语抽背-老师端": 10, "功能索引": 2}
    only = _modules_list_remark(counts)
    if not only.startswith("改动了"):
        return fail(f"fallback must start with 改动了, got {only!r}")
    if "英语抽背-老师端" not in only:
        return fail(f"fallback must include online module, got {only!r}")
    if "功能索引" in only:
        return fail(f"fallback must skip meta areas, got {only!r}")

    # Agent 文件优先于 AI / 兜底（具体内容）
    AGENT_FEATURE_REMARK_FILE.parent.mkdir(parents=True, exist_ok=True)
    AGENT_FEATURE_REMARK_FILE.write_text(
        "英语抽背-老师端：备注移到释义下方并钉住导航\n",
        encoding="utf-8",
    )
    try:
        changes = [
            FileChange(
                path="src/components/EnVocabTeacherQuizFlashcardModal.tsx",
                status="M",
            ),
            FileChange(
                path="src/components/JpVocabTeacherQuizFlashcardStyles.tsx",
                status="M",
            ),
        ]
        with mock.patch(
            "git_commit_message.worktree_changes", return_value=changes
        ), mock.patch(
            "git_commit_message.worktree_diff_excerpt",
            return_value="+en-vocab-flashcard-page__notes\n",
        ), mock.patch(
            "git_commit_message._ai_feature_remark",
            return_value="英语抽背-老师端：这段不该出现",
        ):
            remark = summarize_feature_remark()
        if "备注移到释义下方" not in remark:
            return fail(f"agent file must win over AI, got {remark!r}")
        if "这段不该出现" in remark:
            return fail(f"AI must not override agent file, got {remark!r}")
        if read_agent_feature_remark() is None:
            return fail("read_agent_feature_remark should see file before clear")
    finally:
        clear_agent_feature_remark()

    # 无 Agent、无 AI → 改动了模块
    with mock.patch(
        "git_commit_message.worktree_changes",
        return_value=[
            FileChange(path="src/app/en-vocab/page.tsx", status="M"),
        ],
    ), mock.patch(
        "git_commit_message.worktree_diff_excerpt", return_value="+foo\n"
    ), mock.patch(
        "git_commit_message.read_agent_feature_remark", return_value=None
    ), mock.patch(
        "git_commit_message._ai_feature_remark", return_value=None
    ):
        fallback = summarize_feature_remark()
    if fallback != "改动了英语抽背-老师端":
        return fail(f"no-agent/no-AI fallback expected 改动了英语抽背-老师端, got {fallback!r}")

    print("[check_feature_remark_format] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
