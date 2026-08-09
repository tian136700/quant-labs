#!/usr/bin/env python3
"""回归：学生端卡片须能拿到 usage（及 connection），不能只剩例句。

根因曾复发：peek 窄 SELECT / 备注 merge 用 null 冲掉 usage → 学生只见例句不见用法。
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    live = (ROOT / "src/lib/jp-vocab-db/live_rollover.ts").read_text(
        encoding="utf-8"
    )
    share = (ROOT / "src/lib/jp-vocab-db/share.ts").read_text(encoding="utf-8")
    merge = (ROOT / "src/lib/jp-vocab-class-notes.ts").read_text(encoding="utf-8")
    cache = (ROOT / "src/lib/jp-vocab-study-cache.ts").read_text(encoding="utf-8")
    flash = (
        ROOT / "src/components/JpVocabTeacherQuizFlashcardModal.tsx"
    ).read_text(encoding="utf-8")
    paired = (
        ROOT / "src/components/JpVocabUsageExamplesPairedContent.tsx"
    ).read_text(encoding="utf-8")
    rule = (
        ROOT / ".cursor/rules/jp-vocab-flashcard-examples-parity.mdc"
    ).read_text(encoding="utf-8")

    # peek 须带 usage（学生「查看老师正在抽查」主路径）
    if "usage, usage_source" not in live and "usage, usage_source," not in live:
        # allow multiline: usage, usage_source on own lines near example_sentences
        if "usage_source" not in live or "usage," not in live:
            errors.append("live_rollover peek SELECT 须含 usage / usage_source")
    if "example_sentences" not in live:
        errors.append("live_rollover peek SELECT 须含 example_sentences")

    # shared 列表须带 usage
    if "w.usage" not in share and "usage: row.usage" not in share:
        errors.append("shared 列表须 SELECT / map usage")
    if "w.example_sentences" not in share:
        errors.append("shared 列表须含 example_sentences")

    # merge 不得用 null 冲掉 usage
    if "usage: fetched.usage ?? base.usage" not in merge:
        errors.append("mergeJpVocabWordAfterClassNotesFetch 须保留 usage")
    if "example_sentences:\n      fetched.example_sentences ?? base.example_sentences" not in merge and "fetched.example_sentences ?? base.example_sentences" not in merge:
        errors.append("merge 须保留 example_sentences")

    # 学生卡同组件渲染 usage
    if "usage={w.usage}" not in flash and "usage={w.usage}" not in paired:
        if "usage={w.usage}" not in flash:
            errors.append("抽问卡须把 w.usage 传给 PairedContent")
    if "JpVocabUsageExamplesPairedContent" not in flash:
        errors.append("学生/老师卡须用 JpVocabUsageExamplesPairedContent")

    # 缓存版本：加过 usage 后须升 v；加 pitch_accent 后再升
    if "jp-api:vocab-study:v4" not in cache:
        errors.append("study cache key 须为 v4（含 pitch_accent）")
    if "jp-api:vocab-study:v3" in cache and "jp-api:vocab-study:v4" not in cache:
        errors.append("study cache 仍停在 v3（加 pitch_accent 后须升 v4）")

    if "usage" not in rule or "peek" not in rule:
        errors.append("flashcard-examples-parity 规则须写明 usage + peek")

    # shared / peek 须带音调，否则学生卡只有普通读音
    if "w.pitch_accent" not in share and "pitch_accent: row.pitch_accent" not in share:
        errors.append("shared 列表须 SELECT / map pitch_accent")
    if "pitch_accent" not in live or "pitch_accent_source" not in live:
        errors.append("live_rollover peek SELECT 须含 pitch_accent / pitch_accent_source")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1
    print("ok: jp-vocab study card usage/examples parity")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
