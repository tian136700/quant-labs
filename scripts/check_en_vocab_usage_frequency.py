#!/usr/bin/env python3
"""Regression: English usage lines carry dual frequency [口语n|考试m]; flashcard shows bars."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    ai = read("src/lib/en-vocab-usage-ai.ts")
    if "EN_VOCAB_USAGE_DUAL_FREQUENCY_PREFIX_RE" not in ai:
        fail("missing EN_VOCAB_USAGE_DUAL_FREQUENCY_PREFIX_RE")
    if "extractEnVocabUsageFrequency" not in ai:
        fail("missing extractEnVocabUsageFrequency")
    if "formatEnVocabUsageFrequencyLabel" not in ai:
        fail("missing formatEnVocabUsageFrequencyLabel")
    if "missing_frequency" not in ai:
        fail("validate must reject missing_frequency")
    if "口语频率" not in ai or "考试频率" not in ai:
        fail("prompt/label must mention 口语频率 / 考试频率")
    if "[口语7|考试8]" not in ai and "[口语8|考试9]" not in ai:
        fail("format_example / prompt must show dual [口语n|考试m] sample")
    if "同一核心义项" not in ai and "同一核心义" not in ai:
        fail("usage prompt must tell model to merge near-duplicate senses")
    if "同词性" not in ai or "意思差不多" not in ai:
        fail("usage prompt must hard-merge same-POS near-synonym senses")
    if "按对象" not in ai and "按修饰对象" not in ai:
        fail("usage prompt must forbid splitting one sense by object/scene")
    if "attractive" not in ai:
        fail("usage prompt must give attractive merge anti-example")
    if "fail" not in ai or "考试" not in ai:
        fail("usage prompt must give fail same-POS scene-split anti-example")
    if "freeze" not in ai or "冻结账户" not in ai:
        fail("usage prompt must give freeze same-POS scene-split anti-example")
    if "carefully" not in ai:
        fail("usage prompt must give carefully near-synonym merge anti-example")
    if "近义微调" not in ai and "近义改写" not in ai:
        fail("usage prompt must forbid near-synonym nuance splits")
    if "几乎可互换" not in ai:
        fail("usage prompt must self-check interchangeable example sentences")
    if "动词/名词" not in ai or "ambiguous_pos" not in ai:
        fail("usage prompt/validate must forbid ambiguous slash POS (动词/名词)")
    if "EN_VOCAB_USAGE_AMBIGUOUS_POS_RE" not in ai:
        fail("missing EN_VOCAB_USAGE_AMBIGUOUS_POS_RE")
    if "名词作定语" not in ai or "quality service" not in ai:
        fail("usage prompt must forbid labeling noun attributives as 形容词")
    if "noun_attrib_as_adj" not in ai or "enVocabPosLooksNounOnly" not in ai:
        fail("validate must reject noun_attrib_as_adj when pos is noun-only")
    if "phrase_labeled_as_adj_adv" not in ai:
        fail("validate must reject 形容词：/副词： on multi-word collocations")
    if "EN_VOCAB_USAGE_BARE_ADJ_ADV_LABEL_RE" not in ai:
        fail("missing EN_VOCAB_USAGE_BARE_ADJ_ADV_LABEL_RE")
    if "EN_VOCAB_USAGE_ADJ_LABEL_RE" not in ai:
        fail("missing EN_VOCAB_USAGE_ADJ_LABEL_RE")
    if "分类：" not in ai or "托业" not in ai:
        fail("usage prompt must adapt exam focus by category")
    if "oralFrequency" not in ai or "examFrequency" not in ai:
        fail("usage points must carry oralFrequency + examFrequency")
    if "enVocabUsagePointHasCompleteFrequency" not in ai:
        fail("missing enVocabUsagePointHasCompleteFrequency")

    # format_example 须带双分、禁考试标签（勿 unicode_escape：会弄坏 UTF-8 中文）
    m = re.search(r'format_example:\s*\n?\s*"((?:\\.|[^"\\])*)"', ai)
    if not m:
        fail("format_example not found")
    format_example = m.group(1).replace("\\n", "\n")
    if "[口语" not in format_example or "|考试" not in format_example:
        fail("format_example must include [口语n|考试m] markers")
    if re.search(r"雅思|托福|IELTS|TOEFL", format_example, re.I):
        fail("format_example must not contain exam labels")

    display = read("src/lib/en-vocab-usage-examples-display.ts")
    if "oralFrequency" not in display or "examFrequency" not in display:
        fail("paired display model must carry oralFrequency + examFrequency")
    if "formatEnVocabUsageFrequencyLabel" not in display:
        fail("copy text must use formatEnVocabUsageFrequencyLabel")

    ui = read("src/components/EnVocabUsageExamplesPairedContent.tsx")
    if "JpVocabUsageFrequencyBars" not in ui:
        fail("flashcard UI must reuse JpVocabUsageFrequencyBars for dual bars")
    if "oralFrequency" not in ui or "examFrequency" not in ui:
        fail("flashcard UI must pass oralFrequency + examFrequency")
    # 进度条须在用法正文之后（勿插在「N.用法：」标签后）
    if not re.search(
        r"en-usage-ex-paired-usage-body[\s\S]{0,200}JpVocabUsageFrequencyBars",
        ui,
    ):
        fail("frequency bars must come after usage body text")

    py = read("scripts/en-vocab-fill-usage-api.py")
    if "missing_frequency" not in py:
        fail("Python fill-usage must reject missing_frequency")
    if "[口语" not in py:
        fail("Python fallback prompt must ask for [口语n|考试m]")

    online = read("scripts/en-vocab-fill-online-batch-api.py")
    if "normalize_usage" not in online:
        fail("online batch must normalize_usage (string or array)")
    if "[口语" not in online and "oral_frequency" not in online:
        fail("online SYSTEM/prompt must require dual oral/exam scores")
    if "near-duplicate" not in online and "同一义项" not in online and "同一义" not in online:
        fail("online prompt must forbid splitting one core sense into duplicate lines")
    if "SAME part of speech" not in online and "同词性" not in online:
        fail("online prompt must hard-merge same-POS near-synonym senses")
    if "fail" not in online:
        fail("online prompt must include fail same-POS merge anti-example")
    if "freeze" not in online:
        fail("online prompt must include freeze same-POS merge anti-example")
    if "按对象" not in online and "attractive" not in online:
        fail("online prompt must forbid splitting one sense by object/scene")
    if "几乎可互换" not in online:
        fail("online prompt must self-check interchangeable example sentences")
    if "名词作定语" not in online or "quality service" not in online:
        fail("online prompt must forbid labeling noun attributives as 形容词")
    if "category_focus" not in online or "托业" not in online:
        fail("online batch prompt must adapt by category")
    if "IT面试" not in online and "技术面试" not in online:
        fail("online batch prompt must adapt for IT面试 category")

    edit = read("src/components/EnVocabEditModal.tsx")
    if "[口语" not in edit:
        fail("edit modal placeholder should show dual [口语n|考试m] sample")

    fill = read("src/lib/en-vocab-fill-usage.ts")
    if "enVocabUsageHasCompleteFrequency" not in fill:
        fail("fill-usage must use enVocabUsageHasCompleteFrequency")
    if "needs_frequency_only" not in fill:
        fail("list_missing must flag needs_frequency_only for backfill")
    if "buildEnVocabUsageFrequencyBackfillPrompt" not in fill:
        fail("list_missing must use frequency backfill prompt")
    if "missing_frequency" not in fill:
        fail("force apply must still reject missing_frequency")
    if "[口语" not in fill and "NO_DUAL_FREQ" not in fill:
        fail("fill-usage SQL must look for dual frequency markers")

    if "enVocabUsageHasCompleteFrequency" not in ai:
        fail("missing enVocabUsageHasCompleteFrequency helper")
    if "buildEnVocabUsageFrequencyBackfillPrompt" not in ai:
        fail("missing frequency backfill prompt builder")

    temp = read("scripts/en-vocab-fill-frequency-online-api.py")
    if "fill-usage" not in temp:
        fail("temp frequency online must apply via fill-usage")
    if "EXIT_QUEUE_EMPTY" not in temp:
        fail("temp frequency online must exit 10 when queue empty")
    if "oral_frequency" not in temp or "exam_frequency" not in temp:
        fail("temp frequency online must report applied oral/exam")
    if "needs_frequency_only" not in temp:
        fail("temp frequency online must prefer needs_frequency_only queue")
    if "skip_if_quiz_gate_quiet" not in temp:
        fail("temp frequency online API must skip_if_quiz_gate_quiet")

    stage = read("scripts/en-vocab-fill-frequency-online-stage.sh")
    if "vocab_fill_assert_quiz_gate_ok" not in stage:
        fail("temp frequency stage must call vocab_fill_assert_quiz_gate_ok")
    if "EXIT_QUEUE_EMPTY" not in stage or "bootout" not in stage:
        fail("temp frequency stage must bootout when queue empty")

    setup = Path(ROOT / "scripts/setup-en-vocab-fill-frequency-online-mac.sh")
    if not setup.is_file():
        fail("missing setup-en-vocab-fill-frequency-online-mac.sh")
    plist = Path(
        ROOT / "scripts/com.infoquests.en-vocab-fill-frequency-online.plist.example"
    )
    if not plist.is_file():
        fail("missing en-vocab-fill-frequency-online plist.example")

    docs = read("docs/en-vocab-fill-frequency-api.txt")
    if "fill-usage" not in docs or "[口语" not in docs:
        fail("docs/en-vocab-fill-frequency-api.txt must document fill-usage dual markers")

    breaker = read("scripts/lib/vocab_fill_circuit_breaker.py")
    if "en-vocab-fill-frequency-online" not in breaker:
        fail("circuit breaker must list en-vocab-fill-frequency-online")

    print("OK: en-vocab usage dual frequency (口语/考试) wired end-to-end")


if __name__ == "__main__":
    main()
