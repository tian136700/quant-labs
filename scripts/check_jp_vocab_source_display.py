#!/usr/bin/env python3
"""回归：线上 Claude 来源展示一律「Claude」（≠ Cloud），勿拼版本长名。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CASES: list[tuple[str, str]] = [
    ("线上 claude-sonnet-4-6", "Claude"),
    ("claude-sonnet-4-6 线上", "Claude"),
    ("线上", "Claude"),
    ("Claude", "Claude"),
    ("claude", "Claude"),
    ("Cloud", "Claude"),  # 曾误标
    ("cloud", "Claude"),
    ("cnet-4.6 线上", "Claude"),
    ("手动", "手动"),
    ("本地", "本地"),
    ("gemma4:26b 本地", "gemma4:26b · 本地"),
    ("本地 gemma4:26b", "gemma4:26b · 本地"),
    ("Qwen本地", "Qwen · 本地"),
    ("Jisho", "Jisho"),
    ("Agent现写", "Agent现写"),
]


def _format(raw: str) -> str:
    """Python 镜像：与 src/lib/jp-vocab-source-display.ts 同规则。"""
    original = re.sub(r"\s+", " ", (raw or "").strip())
    if not original:
        return ""
    if re.fullmatch(r"claude", original, flags=re.I):
        return "Claude"
    if (
        re.fullmatch(r"cloud", original, flags=re.I)
        or original == "线上"
        or "线上" in original
        or re.search(r"\bonline\b", original, re.I)
        or re.search(r"\bcloud\b", original, re.I)
        or re.search(r"\bclaude\b", original, re.I)
    ):
        return "Claude"
    if original == "手动":
        return "手动"
    if original == "本地":
        return "本地"

    tags = ("本地", "线上", "手动")
    text = original
    deploy: str | None = None
    for tag in tags:
        if text == tag:
            return "Claude" if tag == "线上" else tag
        if re.match(rf"^{re.escape(tag)}\s+", text):
            deploy = tag
            text = re.sub(rf"^{re.escape(tag)}\s+", "", text).strip()
            break
        if re.search(rf"\s+{re.escape(tag)}$", text):
            deploy = tag
            text = re.sub(rf"\s+{re.escape(tag)}$", "", text).strip()
            break
    if deploy is None:
        for tag in tags:
            if text.endswith(tag) and len(text) > len(tag):
                before = text[: -len(tag)].strip()
                if re.search(r"[A-Za-z0-9]", before):
                    deploy = tag
                    text = before
                    break
    if deploy == "线上":
        return "Claude"
    if text and deploy:
        return f"{text} · {deploy}"
    if text:
        return text
    if deploy:
        return deploy
    return original


def main() -> int:
    display_ts = (ROOT / "src/lib/jp-vocab-source-display.ts").read_text(encoding="utf-8")
    label_tsx = (ROOT / "src/components/JpVocabSourceLabel.tsx").read_text(encoding="utf-8")
    paid = (ROOT / "scripts/lib/paid_anthropic_client.py").read_text(encoding="utf-8")

    if "isOnlineClaudeSource" not in display_ts:
        raise SystemExit("FAIL: missing isOnlineClaudeSource helper")
    if 'return "Claude"' not in display_ts:
        raise SystemExit("FAIL: jp-vocab-source-display must map online → Claude")
    if 'return "Cloud"' in display_ts:
        raise SystemExit("FAIL: must not display Cloud (Claude ≠ Cloud)")
    if "formatJpVocabSourceDisplay" not in label_tsx:
        raise SystemExit("FAIL: JpVocabSourceLabel must use formatJpVocabSourceDisplay")
    if 'return "Claude"' not in paid:
        raise SystemExit("FAIL: build_online_source_label must return Claude")
    if 'return "Cloud"' in paid:
        raise SystemExit("FAIL: build_online_source_label must not return Cloud")
    if 'f"线上 {m}"' in paid or "线上 {m}" in paid:
        raise SystemExit("FAIL: build_online_source_label must not append model name")

    for raw, expect in CASES:
        got = _format(raw)
        if got != expect:
            raise SystemExit(f"FAIL: format({raw!r}) → {got!r}, expect {expect!r}")

    if "· 线上" in display_ts or "·线上" in display_ts:
        raise SystemExit("FAIL: display must not render '· 线上'")

    print("[check_jp_vocab_source_display] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
